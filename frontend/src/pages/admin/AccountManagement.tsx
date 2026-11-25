import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, LockOpen, Search, Trash2 } from "lucide-react";
import Header from "../../components/Header";
import { ConfirmDialog } from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { Notice } from "../../components/FormControls";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { adminService } from "../../services/adminService";
import { formatDate } from "../../utils/validators";
import type { AccountRow, AccountStatus, Paged, Role } from "../../types";

const ROLE_LABEL: Record<Role, string> = { user: "Người dùng phổ thông", doctor: "Cán bộ y tế", admin: "Quản trị viên" };

/** UC-10: tra cứu, đổi vai trò, khóa/mở khóa và xóa tài khoản. Quyền admin được backend kiểm tra. */
export default function AccountManagement() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AccountRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [draft, setDraft] = useState<Record<string, Role>>({});
  const [confirm, setConfirm] = useState<{ account: AccountRow; action: "lock" | "unlock" | "delete" } | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await adminService.accounts({ q, role, status, page })); setDraft({}); }
    catch (e) { setData(null); setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không tải được danh sách tài khoản." }); }
    finally { setLoading(false); }
  }, [q, role, status, page]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t); }, [load]);

  async function saveRole(a: AccountRow) {
    const next = draft[a.userId];
    if (!next || next === a.role) return;
    setBusyId(a.userId); setMsg(null);
    try { await adminService.updateAccount(a.userId, { role: next }); setMsg({ tone: "success", text: "Cập nhật thông tin tài khoản thành công" }); await load(); }
    catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không cập nhật được tài khoản." }); }
    finally { setBusyId(""); }
  }

  async function toggleLock() {
    if (!confirm) return;
    const { account: a } = confirm;
    setBusyId(a.userId); setMsg(null);
    try {
      await adminService.updateAccount(a.userId, { status: a.status === "active" ? "locked" : "active" });
      setMsg({ tone: "success", text: "Cập nhật thông tin tài khoản thành công" });
      setConfirm(null); await load();
    } catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không cập nhật được tài khoản." }); setConfirm(null); }
    finally { setBusyId(""); }
  }

  async function deleteAccount() {
    if (!confirm || confirm.action !== "delete") return;
    const { account } = confirm;
    setBusyId(account.userId); setMsg(null);
    try {
      await adminService.deleteAccount(account.userId);
      setConfirm(null);
      setMsg({ tone: "success", text: `Đã xóa tài khoản "${account.name}".` });
      await load();
    } catch (e) {
      setConfirm(null);
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không xóa được tài khoản." });
    } finally { setBusyId(""); }
  }

  return (
    <div>
      <Header title="Tài khoản & phân quyền" subtitle="Quản lý vai trò và trạng thái hoạt động của tài khoản"
        actions={<button type="button" className="dh-primary-action" disabled title="Chức năng tạo tài khoản mới chưa có trong API hiện tại">+ Tài khoản mới</button>} />
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <div className="panel">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_190px_170px]">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input aria-label="Tìm tài khoản" className="field-input pl-9" placeholder="Tên, email hoặc SĐT" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
          <select aria-label="Vai trò" className="field-input" value={role} onChange={(e) => { setRole(e.target.value as Role | ""); setPage(1); }}>
            <option value="">Mọi vai trò</option>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
          <select aria-label="Trạng thái" className="field-input" value={status} onChange={(e) => { setStatus(e.target.value as AccountStatus | ""); setPage(1); }}>
            <option value="">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="locked">Đã khóa</option></select>
        </div>

        {loading ? <div className="flex justify-center py-10 text-brand-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
          : !data || data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Không tìm thấy tài khoản phù hợp</p>
            : (<><div className="overflow-x-auto"><table className="w-full min-w-[840px]">
              <thead className="border-b border-slate-200"><tr><th className="th">Họ tên</th><th className="th">Email / SĐT</th><th className="th">Vai trò</th><th className="th">Trạng thái</th><th className="th">Ngày tạo</th><th className="th text-right">Thao tác</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.items.map((a) => {
                const self = a.userId === user?.userId;
                const cur = draft[a.userId] ?? a.role;
                return (<tr key={a.userId}>
                  <td className="td font-medium">{a.name}</td>
                  <td className="td text-xs">{a.email}<br />{a.phoneNumber}</td>
                  <td className="td"><select aria-label={`Vai trò của ${a.name}`} className="field-input !h-8 !py-0 text-xs" value={cur} disabled={self}
                    onChange={(e) => setDraft({ ...draft, [a.userId]: e.target.value as Role })}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
                  <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{a.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td>
                  <td className="td text-xs">{formatDate(a.createdAt)}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="btn-primary !px-3 !py-1 text-xs" disabled={self || cur === a.role || busyId === a.userId} onClick={() => saveRole(a)}>Lưu thay đổi</button>
                    <button className="btn-ghost ml-1 !px-2 !py-1" disabled={self || busyId === a.userId} aria-label={a.status === "active" ? "Khóa tài khoản" : "Mở khóa tài khoản"} onClick={() => setConfirm({ account: a, action: a.status === "active" ? "lock" : "unlock" })}>
                      {a.status === "active" ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}</button>
                    <button className="btn-ghost ml-1 !px-2 !py-1 text-red-600 hover:text-red-700" disabled={self || busyId === a.userId} aria-label={`Xóa tài khoản ${a.name}`} onClick={() => setConfirm({ account: a, action: "delete" })}>
                      <Trash2 className="h-4 w-4" /></button>
                  </td></tr>);
              })}</tbody></table></div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      </div>
      {confirm && <ConfirmDialog
        title={confirm.action === "delete" ? "Xóa tài khoản" : confirm.action === "lock" ? "Khóa tài khoản" : "Mở khóa tài khoản"}
        message={confirm.action === "delete"
          ? `Xóa tài khoản "${confirm.account.name}" khỏi hệ thống? Thông tin đăng nhập sẽ bị vô hiệu hóa và các phiên đang hoạt động sẽ bị thu hồi. Lịch sử dự đoán và nhật ký liên quan vẫn được giữ lại.`
          : confirm.action === "lock"
            ? `Khóa tài khoản "${confirm.account.name}"? Phiên làm việc hiện tại sẽ bị hủy và tài khoản không thể đăng nhập.`
            : `Mở khóa tài khoản "${confirm.account.name}"?`}
        confirmLabel={confirm.action === "delete" ? "Xóa tài khoản" : confirm.action === "lock" ? "Khóa" : "Mở khóa"}
        busy={busyId === confirm.account.userId}
        onConfirm={() => void (confirm.action === "delete" ? deleteAccount() : toggleLock())}
        onCancel={() => setConfirm(null)} />}
    </div>
  );
}
