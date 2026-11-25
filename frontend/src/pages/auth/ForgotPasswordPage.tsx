import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Home, Loader2, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";
import BrandPanel from "./components/BrandPanel";
import FormField from "./components/FormField";
import "./auth.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await authService.requestPasswordReset(email);
      setMessage(response.message);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không thể gửi yêu cầu đặt lại mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fg-page">
      <div className="fg-shell fg-shell--single">
        <BrandPanel />
        <section className="fg-card" aria-labelledby="forgot-heading">
          <h2 id="forgot-heading">QUÊN MẬT KHẨU</h2>
          <p className="fg-subtitle">Nhập email đã đăng ký. Nếu tài khoản tồn tại, hướng dẫn sẽ được gửi đến hộp thư.</p>
          <form className="fg-form" onSubmit={(event) => void submit(event)} noValidate>
            {error && <div role="alert" className="fg-alert fg-alert-error"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
            {message && <div role="status" className="fg-alert fg-alert-success"><CheckCircle2 aria-hidden="true" /><span>{message}</span></div>}
            <FormField id="forgot-email" icon={<Mail />}>
              <input id="forgot-email" type="email" autoComplete="email" required maxLength={254}
                value={email} onChange={(event) => setEmail(event.target.value)} aria-label="Email đã đăng ký" placeholder="Email đã đăng ký" />
            </FormField>
            <button type="submit" className="fg-submit" disabled={busy || !email.trim()}>
              {busy && <Loader2 className="fg-spin" aria-hidden="true" />}
              {busy ? "Đang gửi..." : "Gửi hướng dẫn"}
            </button>
          </form>
          <p className="fg-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
        </section>
      </div>
      <Link to="/" className="fg-home-link"><Home aria-hidden="true" /> Về trang chủ</Link>
    </main>
  );
}
