import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { Modal } from "./Modal";
import Pagination from "./Pagination";
import PredictionResultCard, { RiskBadge } from "./Sidebar";
import { Notice, SelectField, TextField } from "./FormControls";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/api";
import { authService } from "../services/authService";
import { mlService } from "../services/mlService";
import { formatDateTime } from "../utils/validators";
import type { PredictionListItem, PredictionResult, RiskLevel } from "../types";

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [birthdate, setBirthdate] = useState(user?.birthdate || "");
  const [gender, setGender] = useState(user?.gender || "");
  const [address, setAddress] = useState(user?.address || "");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setPhoneNumber(user?.phoneNumber || "");
    setBirthdate(user?.birthdate || "");
    setGender(user?.gender || "");
    setAddress(user?.address || "");
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await authService.updateProfile({ name, phoneNumber, birthdate, gender: gender === "male" || gender === "female" ? gender : undefined, address });
      await refreshUser();
      setMessage({ tone: "success", text: "Đã cập nhật thông tin tài khoản." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "Không thể cập nhật thông tin." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header title="Thông tin cá nhân" subtitle="Cập nhật thông tin liên hệ và hồ sơ của bạn" />
      <form className="panel max-w-2xl space-y-4" onSubmit={submit}>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="profile-name" label="Họ và tên" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          <TextField id="profile-email" label="Email (chỉ xem)" value={user?.email || ""} readOnly />
          <TextField id="profile-phone" label="Số điện thoại" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
          <TextField id="profile-birthdate" label="Ngày sinh" type="date" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} />
          <SelectField id="profile-gender" label="Giới tính" value={gender} onChange={(event) => setGender(event.target.value)}>
            <option value="">Chưa cung cấp</option><option value="female">Nữ</option><option value="male">Nam</option>
          </SelectField>
          <TextField id="profile-address" label="Địa chỉ" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} />
        </div>
        <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Lưu thay đổi</button>
      </form>
    </div>
  );
}

export function PasswordPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setMessage({ tone: "error", text: "Mật khẩu mới và xác nhận không khớp." });
      return;
    }
    setBusy(true);
    try {
      await authService.changePassword({ currentPassword, newPassword, confirmPassword });
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "Không thể đổi mật khẩu." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header title="Đổi mật khẩu" subtitle="Mật khẩu mới sẽ được mã hóa trước khi lưu" />
      <form className="panel max-w-xl space-y-4" onSubmit={submit}>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <TextField id="current-password" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
        <TextField id="new-password" label="Mật khẩu mới (ít nhất 8 ký tự)" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required />
        <TextField id="confirm-password" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
        <button className="btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Cập nhật mật khẩu</button>
      </form>
    </div>
  );
}

export function OwnHistoryPage() {
  const [page, setPage] = useState(1);
  const [risk, setRisk] = useState<RiskLevel | "">("");
  const [data, setData] = useState<{ items: PredictionListItem[]; total: number; page: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<PredictionResult | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await mlService.history({ scope: "mine", riskLevel: risk, page }));
    } catch (cause) {
      setData(null);
      setError(cause instanceof ApiError ? cause.message : "Không tải được lịch sử dự đoán.");
    } finally {
      setLoading(false);
    }
  }, [page, risk]);
  useEffect(() => { void load(); }, [load]);

  async function showDetail(id: string) {
    setBusyId(id);
    setError("");
    try {
      setDetail(await mlService.detail(id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được chi tiết dự đoán.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <Header title="Lịch sử dự đoán cá nhân" subtitle="Chỉ hiển thị các lần tự đánh giá của tài khoản đang đăng nhập" />
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      <section className="panel">
        <SelectField id="history-risk" label="Lọc theo mức nguy cơ" className="mb-4 max-w-xs" value={risk} onChange={(event) => { setRisk(event.target.value as RiskLevel | ""); setPage(1); }}>
          <option value="">Mọi mức nguy cơ</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
        </SelectField>
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>
          : !data?.items.length ? <p className="py-8 text-center text-sm text-slate-500">Chưa có dữ liệu dự đoán nào.</p>
            : <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead><tr className="border-b border-slate-200"><th className="th">Thời gian</th><th className="th">Chế độ</th><th className="th">Mức nguy cơ</th><th className="th">Xác suất</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-100">{data.items.map((item) => (
                    <tr key={item.predictionId}>
                      <td className="td">{formatDateTime(item.createdAt)}</td>
                      <td className="td">{item.mode === "clinical" ? "Lâm sàng" : "Phi lâm sàng"}</td>
                      <td className="td"><RiskBadge level={item.riskLevel} /></td>
                      <td className="td">{(item.probability * 100).toFixed(1)}%</td>
                      <td className="td text-right"><button className="btn-ghost !px-2 !py-1" aria-label="Xem chi tiết" onClick={() => void showDetail(item.predictionId)} disabled={busyId === item.predictionId}>{busyId === item.predictionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>}
      </section>
      {detail && <Modal title="Chi tiết dự đoán" wide onClose={() => setDetail(null)}><PredictionResultCard result={detail} /></Modal>}
    </div>
  );
}
