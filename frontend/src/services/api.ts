import type { ApiFieldErrors } from "../types";

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

const TOKEN_KEY = "diarisk.token";
const USER_KEY = "diarisk.user";

/** Lỗi API chuẩn hoá: message hiển thị chung, fieldErrors gắn vào từng trường form. */
export class ApiError extends Error {
  status: number;
  fieldErrors: ApiFieldErrors;
  code?: string;

  constructor(message: string, status = 0, fieldErrors: ApiFieldErrors = {}, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = code;
  }
}

// ---- Lưu token: "ghi nhớ" -> localStorage, ngược lại -> sessionStorage ----
export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  },
  set(token: string, remember: boolean) {
    this.clear();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
  },
};

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean; // mặc định true
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

/** Chuẩn hoá nhiều dạng lỗi thường gặp từ Express/Zod/Pydantic thành { message, fieldErrors }. */
function parseErrorBody(data: unknown): { message?: string; fieldErrors: ApiFieldErrors; code?: string } {
  const fieldErrors: ApiFieldErrors = {};
  if (!data || typeof data !== "object") return { fieldErrors };
  const d = data as Record<string, unknown>;
  const message = typeof d.message === "string" ? d.message : typeof d.detail === "string" ? d.detail : undefined;
  const code = typeof d.code === "string" ? d.code : undefined;

  const fe = d.fieldErrors ?? d.errors;
  if (fe && typeof fe === "object" && !Array.isArray(fe)) {
    Object.entries(fe as Record<string, unknown>).forEach(([k, v]) => {
      if (typeof v === "string") fieldErrors[k] = v;
      else if (Array.isArray(v) && typeof v[0] === "string") fieldErrors[k] = v[0];
    });
  } else if (Array.isArray(fe)) {
    (fe as Array<Record<string, unknown>>).forEach((e) => {
      const field = typeof e.field === "string" ? e.field : typeof e.path === "string" ? e.path : undefined;
      const msg = typeof e.message === "string" ? e.message : undefined;
      if (field && msg) fieldErrors[field] = msg;
    });
  }
  // Pydantic/FastAPI: detail = [{ loc: [...], msg }]
  if (Array.isArray(d.detail)) {
    (d.detail as Array<{ loc?: unknown[]; msg?: string }>).forEach((e) => {
      const field = Array.isArray(e.loc) ? String(e.loc[e.loc.length - 1]) : undefined;
      if (field && e.msg) fieldErrors[field] = e.msg;
    });
  }
  return { message, fieldErrors, code };
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, query, auth = true, signal } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth) {
    const token = tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let payload: BodyInit | undefined;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: payload, signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0);
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") || "";
  const data: unknown = contentType.includes("application/json") ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const parsed = parseErrorBody(data);
    // Hết hạn phiên (JWT 30 phút) -> đăng xuất, trừ các request xác thực (đăng nhập sai không phải hết phiên)
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw new ApiError(parsed.message || defaultMessage(res.status), res.status, parsed.fieldErrors, parsed.code);
  }
  return data as T;
}

function defaultMessage(status: number): string {
  if (status === 401) return "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.";
  if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu yêu cầu.";
  if (status === 409) return "Dữ liệu đã tồn tại.";
  if (status === 422 || status === 400) return "Dữ liệu không hợp lệ.";
  if (status >= 500) return "Máy chủ gặp lỗi, vui lòng thử lại sau.";
  return "Đã có lỗi xảy ra.";
}

/** Tải file nhị phân (báo cáo, tệp mẫu) và kích hoạt lưu về máy. */
async function download(path: string, opts: RequestOptions & { fallbackName: string }): Promise<void> {
  const { method = "GET", body, query, fallbackName } = opts;
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("Không thể kết nối tới máy chủ.", 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(parseErrorBody(data).message || defaultMessage(res.status), res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>(path, { method: "POST", body, auth }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", form }),
  download,
};
