import { useState, type FormEvent } from "react";
import { AlertCircle, Home, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";
import { isStrongPassword, PASSWORD_REQUIREMENT_MESSAGE } from "../../utils/validators";
import BrandPanel from "./components/BrandPanel";
import FormField from "./components/FormField";
import "./auth.css";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldError("");
    if (!token) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      return;
    }
    if (!isStrongPassword(password)) {
      setFieldError(PASSWORD_REQUIREMENT_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setBusy(true);
    try {
      await authService.resetPassword({ token, password, confirmPassword });
      navigate("/login", { replace: true, state: { notice: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập." } });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFieldError(cause.fieldErrors.confirmPassword || cause.fieldErrors.password || "");
        setError(cause.message);
      } else {
        setError("Không thể đặt lại mật khẩu.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fg-page">
      <div className="fg-shell fg-shell--single">
        <BrandPanel />
        <section className="fg-card" aria-labelledby="reset-heading">
          <h2 id="reset-heading">TẠO MẬT KHẨU MỚI</h2>
          <p className="fg-subtitle">Liên kết chỉ sử dụng được một lần và có thời hạn 15 phút.</p>
          <form className="fg-form" onSubmit={(event) => void submit(event)} noValidate>
            {error && <div role="alert" className="fg-alert fg-alert-error"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
            <FormField id="reset-password" icon={<KeyRound />} error={fieldError}>
              <input id="reset-password" type="password" autoComplete="new-password" required value={password}
                onChange={(event) => setPassword(event.target.value)} aria-label="Mật khẩu mới" placeholder="Mật khẩu mới" />
            </FormField>
            <FormField id="reset-confirm" icon={<LockKeyhole />} error={fieldError}>
              <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)} aria-label="Xác nhận mật khẩu mới" placeholder="Xác nhận mật khẩu mới" />
            </FormField>
            <button type="submit" className="fg-submit" disabled={busy || !token}>
              {busy && <Loader2 className="fg-spin" aria-hidden="true" />}
              {busy ? "Đang cập nhật..." : "Đặt lại mật khẩu"}
            </button>
          </form>
          <p className="fg-switch"><Link to="/forgot-password">Yêu cầu liên kết mới</Link></p>
        </section>
      </div>
      <Link to="/" className="fg-home-link"><Home aria-hidden="true" /> Về trang chủ</Link>
    </main>
  );
}
