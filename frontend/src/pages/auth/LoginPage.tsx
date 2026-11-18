import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { ROLE_HOME } from "../../services/authService";
import BrandPanel from "./components/BrandPanel";
import FormField from "./components/FormField";
import "./auth.css";

type LoginErrors = { identifier?: string; password?: string };

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginErrors>({});
  const notice = location.state && typeof location.state === "object" && "notice" in location.state
    ? location.state.notice
    : "";
  const [success, setSuccess] = useState(typeof notice === "string" ? notice : "");
  const [busy, setBusy] = useState(false);

  function change(field: keyof LoginErrors, value: string, update: (value: string) => void) {
    update(value);
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (busy) return;

    const validationErrors: LoginErrors = {
      ...(!identifier.trim() ? { identifier: "Vui lòng nhập email hoặc số điện thoại." } : {}),
      ...(!password ? { password: "Vui lòng nhập mật khẩu." } : {}),
    };
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    setBusy(true);
    try {
      const user = await signIn({ identifier, password, remember });
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFieldErrors({ identifier: cause.fieldErrors.identifier, password: cause.fieldErrors.password });
        setError(cause.message);
      } else {
        setError("Không thể đăng nhập.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fg-page">
      <div className="fg-shell">
        <BrandPanel />

        <section className="fg-card" aria-labelledby="login-heading">
          <h2 id="login-heading">ĐĂNG NHẬP</h2>
          <p className="fg-subtitle">Vui lòng tiếp tục đăng nhập để sử dụng hệ thống</p>

          <form className="fg-form" onSubmit={(event) => void submit(event)} noValidate>
            {error && (
              <div role="alert" className="fg-alert fg-alert-error">
                <AlertCircle aria-hidden="true" /><span>{error}</span>
              </div>
            )}
            {success && (
              <div role="status" className="fg-alert fg-alert-success">
                <CheckCircle2 aria-hidden="true" /><span>{success}</span>
              </div>
            )}

            <FormField id="identifier" icon={<UserRound />} error={fieldErrors.identifier}>
              <input
                id="identifier" type="text" autoComplete="username" value={identifier}
                onChange={(event) => change("identifier", event.target.value, setIdentifier)}
                aria-label="Tên đăng nhập hoặc email"
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={fieldErrors.identifier ? "identifier-error" : undefined}
                placeholder="Tên đăng nhập/Email"
              />
            </FormField>

            <FormField id="login-password" icon={<LockKeyhole />} error={fieldErrors.password}>
              <input
                id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password}
                onChange={(event) => change("password", event.target.value, setPassword)}
                aria-label="Mật khẩu"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                placeholder="Mật khẩu"
              />
              <button
                className="fg-eye" type="button" onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}
              >
                {showPassword ? <Eye /> : <EyeOff />}
              </button>
            </FormField>

            <div className="fg-options">
              <label className="fg-remember">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>Ghi nhớ đăng nhập</span>
              </label>
              <Link to="/forgot-password" className="fg-forgot">Quên mật khẩu ?</Link>
            </div>

            <button type="submit" className="fg-submit" disabled={busy}>
              {busy && <Loader2 className="fg-spin" aria-hidden="true" />}
              {busy ? "Đang xử lý..." : "Đăng nhập"}
            </button>
          </form>

          <p className="fg-switch">
            Bạn chưa có tài khoản? <Link to="/register">Đăng kí</Link>
          </p>
        </section>
      </div>
    </main>
  );
}