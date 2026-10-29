import { api, tokenStore } from "./api";
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload } from "../types";

/**
 * Các endpoint backend (Node/Express) mà frontend kỳ vọng:
 *  POST /auth/register          -> 201 { message }        | 400/409 fieldErrors by input name
 *  POST /auth/login             -> 200 { token, user }    | 401 | 403 (khoá)
 *  GET  /auth/me                -> 200 { user }
 *  POST /auth/logout            -> 204
 *  PATCH /users/me              -> 200 { user }
 *  POST /users/me/password      -> 204
 * Role luôn lấy từ `user.role` do backend trả về.
 */
export const authService = {
  async login(p: LoginPayload): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>(
      "/auth/login",
      { identifier: p.identifier.trim(), password: p.password },
      false,
    );
    tokenStore.set(res.token, p.remember);
    return res;
  },

  /** Không tự đăng nhập; chỉ coi là thành công khi API trả 2xx. */
  async register(p: RegisterPayload): Promise<void> {
    const body: Record<string, unknown> = {
      role: p.role,
      name: p.name.trim(),
      phoneNumber: p.phoneNumber.trim(),
      email: p.email.trim().toLowerCase(),
      birthdate: p.birthdate,
      gender: p.gender,
      address: p.address.trim(),
      password: p.password,
      confirmPassword: p.confirmPassword,
    };
    if (p.role === "doctor") {
      body.workplace = (p.workplace ?? "").trim();
      body.staffCode = (p.staffCode ?? "").trim();
    }
    await api.post("/auth/register", body, false);
  },

  async me(): Promise<AuthUser> {
    const res = await api.get<{ user: AuthUser }>("/auth/me");
    return res.user;
  },

  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      /* phiên có thể đã hết hạn: vẫn xoá token cục bộ */
    } finally {
      tokenStore.clear();
    }
  },

  async updateProfile(data: Partial<Pick<AuthUser, "name" | "birthdate" | "gender" | "address" | "phoneNumber">>): Promise<AuthUser> {
    await api.patch("/users/me", data);
    return this.me();
  },

  async changePassword(p: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<void> {
    await api.post("/users/me/password", p);
  },
};

export const ROLE_HOME: Record<AuthUser["role"], string> = {
  user: "/user/predict",
  doctor: "/doctor/predict",
  admin: "/admin/accounts",
};
