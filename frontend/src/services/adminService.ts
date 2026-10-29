import { api } from "./api";
import type { AccountRow, AccountStatus, ActivityLogRow, ExcelTemplate, Paged, Role } from "../types";

/**
 * Quyền admin được kiểm tra tại backend; frontend chỉ ẩn/hiện giao diện.
 *  GET   /admin/accounts           ?q&role&status&page&pageSize
 *  PATCH /admin/accounts/:id       { role?, status? }
 *  GET   /admin/templates
 *  POST  /admin/templates          multipart(file, templateName, version)
 *  PATCH /admin/templates/:id      { isActive }
 *  GET   /admin/logs               ?actionType&userId&from&to&page&pageSize
 *  POST  /admin/logs/export        { format: "xlsx" | "csv", ...filters }
 */
export interface AccountFilter { q?: string; role?: Role | ""; status?: AccountStatus | ""; page?: number; pageSize?: number }
export interface LogFilter { actionType?: string; q?: string; from?: string; to?: string; page?: number; pageSize?: number }

export const adminService = {
  accounts(f: AccountFilter = {}): Promise<Paged<AccountRow>> {
    return api.get<Paged<AccountRow>>("/admin/accounts", {
      q: f.q, role: f.role || undefined, status: f.status || undefined, page: f.page ?? 1, pageSize: f.pageSize ?? 10,
    });
  },

  updateAccount(id: string, data: { role?: Role; status?: AccountStatus }): Promise<AccountRow> {
    return api.patch<AccountRow>(`/admin/accounts/${encodeURIComponent(id)}`, data);
  },

  templates(): Promise<ExcelTemplate[]> {
    return api.get<ExcelTemplate[]>("/admin/templates");
  },

  uploadTemplate(file: File, templateName: string, version: string): Promise<ExcelTemplate> {
    const form = new FormData();
    form.append("file", file);
    form.append("templateName", templateName);
    form.append("version", version);
    return api.upload<ExcelTemplate>("/admin/templates", form);
  },

  setTemplateActive(id: string, isActive: boolean): Promise<ExcelTemplate> {
    return api.patch<ExcelTemplate>(`/admin/templates/${encodeURIComponent(id)}`, { isActive });
  },

  logs(f: LogFilter = {}): Promise<Paged<ActivityLogRow>> {
    return api.get<Paged<ActivityLogRow>>("/admin/logs", {
      actionType: f.actionType || undefined, q: f.q, from: f.from, to: f.to, page: f.page ?? 1, pageSize: f.pageSize ?? 15,
    });
  },

  exportLogs(format: "xlsx" | "csv", f: LogFilter = {}): Promise<void> {
    return api.download("/admin/logs/export", { method: "POST", body: { format, ...f }, fallbackName: `activity_logs.${format}` });
  },
};
