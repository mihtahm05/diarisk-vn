import { useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, AlertCircle, BadgeCheck, Building2, CalendarDays, CheckCircle2, ClipboardList, Eye, EyeOff,
  HeartPulse, Loader2, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, Stethoscope, UserRound,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { authService, ROLE_HOME } from "../../services/authService";
import type { Gender } from "../../types";

type AuthMode = "login" | "register";
type RegistrationField = "name" | "phoneNumber" | "email" | "birthdate" | "gender" | "address" |
  "password" | "confirmPassword" | "workplace" | "staffCode";
type FieldErrors = Partial<Record<RegistrationField | "identifier", string>>;
const registrationFields: RegistrationField[] = [
  "name", "phoneNumber", "email", "birthdate", "gender", "address", "password",
  "confirmPassword", "workplace", "staffCode",
];

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Field({
  id, label, icon, error, children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-control">
      <label className="auth-label" htmlFor={id}>{label}</label>
      <div className="auth-field" data-invalid={Boolean(error)}>
        <span className="field-icon" aria-hidden="true">{icon}</span>
        {children}
      </div>
      {error && <p className="auth-field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export default function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const today = localDateValue(new Date());
  const [role, setRole] = useState<"user" | "doctor">("user");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [address, setAddress] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const notice = location.state && typeof location.state === "object" && "notice" in location.state
    ? location.state.notice
    : "";
  const [success, setSuccess] = useState(typeof notice === "string" ? notice : "");
  const [busy, setBusy] = useState(false);

  function updateField<K extends keyof FieldErrors>(field: K, value: string, update: (value: string) => void) {
    update(value);
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setError("");
    setSuccess("");
  }

  function validate(): FieldErrors {
    if (mode === "login") {
      return {
        ...(!identifier.trim() ? { identifier: "Vui lòng nhập email hoặc số điện thoại." } : {}),
        ...(!password ? { password: "Vui lòng nhập mật khẩu." } : {}),
      };
    }

    const errors: FieldErrors = {};
    if (name.trim().length < 2 || name.trim().length > 120) errors.name = "Họ tên cần có từ 2 đến 120 ký tự.";
    if (!/^\+?[\d\s().-]{8,20}$/.test(phoneNumber.trim())) errors.phoneNumber = "Nhập số điện thoại hợp lệ (8–20 ký tự).";
    if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Nhập địa chỉ email hợp lệ (tối đa 254 ký tự).";
    if (!birthdate || Number.isNaN(Date.parse(birthdate)) || birthdate > today) {
      errors.birthdate = "Chọn ngày sinh hợp lệ, không ở tương lai.";
    }
    if (!gender) errors.gender = "Vui lòng chọn giới tính.";
    if (!address.trim() || address.trim().length > 500) errors.address = "Nhập địa chỉ (tối đa 500 ký tự).";
    if (password.length < 8 || password.length > 128) errors.password = "Mật khẩu phải có từ 8 đến 128 ký tự.";
    if (password !== confirmPassword) errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    if (role === "doctor" && (workplace.trim().length < 2 || workplace.trim().length > 200)) errors.workplace = "Tên đơn vị cần có từ 2 đến 200 ký tự.";
    if (role === "doctor" && (staffCode.trim().length < 2 || staffCode.trim().length > 80)) errors.staffCode = "Mã cán bộ cần có từ 2 đến 80 ký tự.";
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (busy) return;

    const validationErrors = validate();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    setBusy(true);
    try {
      if (mode === "login") {
        const user = await signIn({ identifier, password, remember });
        navigate(ROLE_HOME[user.role], { replace: true });
        return;
      }

      await authService.register({
        role,
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim().toLowerCase(),
        birthdate,
        gender: gender as Gender,
        address: address.trim(),
        password,
        confirmPassword,
        workplace: role === "doctor" ? workplace.trim() : undefined,
        staffCode: role === "doctor" ? staffCode.trim() : undefined,
      });
      navigate("/login", { replace: true, state: { notice: "Đăng ký thành công. Vui lòng đăng nhập." } });
    } catch (cause) {
      if (cause instanceof ApiError) {
        const mappedErrors: FieldErrors = {};
        if (cause.fieldErrors.identifier) mappedErrors.identifier = cause.fieldErrors.identifier;
        for (const field of registrationFields) {
          if (cause.fieldErrors[field]) mappedErrors[field] = cause.fieldErrors[field];
        }
        setFieldErrors(mappedErrors);
        setError(cause.message);
      } else {
        setError(mode === "login" ? "Không thể đăng nhập." : "Không thể đăng ký tài khoản.");
      }
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "login" ? "ĐĂNG NHẬP" : "ĐĂNG KÝ TÀI KHOẢN";

  return (
    <main className="auth-page">
      <div className={`auth-layout ${mode === "register" ? "auth-layout-register" : ""}`}>
        <section className="auth-brand" aria-label="DiaRisk VN">
          <div className="auth-brand-glow auth-brand-glow-top" />
          <div className="auth-brand-glow auth-brand-glow-bottom" />
          <Activity className="auth-brand-spark auth-brand-spark-one" aria-hidden="true" />
          <HeartPulse className="auth-brand-spark auth-brand-spark-two" aria-hidden="true" />
          <div className="auth-brand-content">
            <div className="auth-logo" aria-hidden="true">
              <HeartPulse className="h-9 w-9" strokeWidth={2.2} />
              <span><Activity className="h-4 w-4" /></span>
            </div>
            <p className="auth-brand-kicker">HỆ THỐNG HỖ TRỢ SỨC KHỎE</p>
            <h1>DiaRisk <span>VN</span></h1>
            <p className="auth-brand-description">
              Đồng hành cùng bạn trong việc theo dõi thông tin và tìm hiểu nguy cơ sức khỏe.
            </p>
          </div>
          <div className="auth-medical-art" aria-hidden="true">
            <div className="auth-art-orbit auth-art-orbit-one" />
            <div className="auth-art-orbit auth-art-orbit-two" />
            <div className="auth-art-card auth-art-card-left">
              <ClipboardList />
              <span />
              <span />
              <span />
            </div>
            <div className="auth-art-monitor">
              <div><Activity /></div>
              <small>HEALTH CHECK</small>
            </div>
            <div className="auth-art-drop"><Activity /></div>
            <div className="auth-art-shield"><ShieldCheck /></div>
            <div className="auth-art-card auth-art-card-right">
              <HeartPulse />
              <span />
              <span />
            </div>
          </div>
          <p className="auth-brand-caption"><ShieldCheck aria-hidden="true" /> BẢO MẬT THÔNG TIN SỨC KHỎE</p>
        </section>

        <section className="auth-form-side">
          <div className="auth-card">
            <header className="auth-card-header">
              <div className="auth-mobile-logo" aria-hidden="true"><HeartPulse /></div>
              <p className="auth-eyebrow">{mode === "login" ? "CHÀO MỪNG TRỞ LẠI" : "BẮT ĐẦU CÙNG DIARISK VN"}</p>
              <h2>{heading}</h2>
              <p className="auth-subtitle">
                {mode === "login" ? "Đăng nhập để tiếp tục sử dụng hệ thống." : "Điền thông tin để tạo tài khoản mới."}
              </p>
            </header>

            <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
              {error && (
                <div role="alert" className="auth-alert auth-alert-error">
                  <AlertCircle aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div role="status" className="auth-alert auth-alert-success">
                  <CheckCircle2 aria-hidden="true" />
                  <span>{success}</span>
                </div>
              )}

              {mode === "login" ? (
                <>
                  <Field id="identifier" label="Tên đăng nhập / Email / Số điện thoại" icon={<UserRound />} error={fieldErrors.identifier}>
                    <input id="identifier" type="text" autoComplete="username" value={identifier}
                      onChange={(event) => updateField("identifier", event.target.value, setIdentifier)}
                      aria-invalid={Boolean(fieldErrors.identifier)} aria-describedby={fieldErrors.identifier ? "identifier-error" : undefined}
                      placeholder="Nhập email hoặc số điện thoại" />
                  </Field>
                  <Field id="login-password" label="Mật khẩu" icon={<LockKeyhole />} error={fieldErrors.password}>
                    <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password}
                      onChange={(event) => updateField("password", event.target.value, setPassword)}
                      aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                      placeholder="Nhập mật khẩu" />
                    <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </Field>
                  <div className="auth-login-options">
                    <label className="auth-checkbox">
                      <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                      <span>Ghi nhớ đăng nhập</span>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <fieldset className="auth-role-picker">
                    <legend>Loại tài khoản</legend>
                    <div className="auth-role-options">
                      <button type="button" className={role === "user" ? "selected" : ""} onClick={() => setRole("user")} aria-pressed={role === "user"}>
                        <UserRound aria-hidden="true" /><span>Người dùng phổ thông</span>
                      </button>
                      <button type="button" className={role === "doctor" ? "selected" : ""} onClick={() => setRole("doctor")} aria-pressed={role === "doctor"}>
                        <Stethoscope aria-hidden="true" /><span>Cán bộ y tế</span>
                      </button>
                    </div>
                  </fieldset>

                  <div className="auth-field-grid">
                    <Field id="register-name" label="Họ và tên" icon={<UserRound />} error={fieldErrors.name}>
                      <input id="register-name" autoComplete="name" maxLength={120} value={name} onChange={(event) => updateField("name", event.target.value, setName)}
                        aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "register-name-error" : undefined} placeholder="Nguyễn Văn A" />
                    </Field>
                    <Field id="register-phone" label="Số điện thoại" icon={<Phone />} error={fieldErrors.phoneNumber}>
                      <input id="register-phone" type="tel" autoComplete="tel" maxLength={20} value={phoneNumber}
                        onChange={(event) => updateField("phoneNumber", event.target.value, setPhoneNumber)}
                        aria-invalid={Boolean(fieldErrors.phoneNumber)} aria-describedby={fieldErrors.phoneNumber ? "register-phone-error" : undefined}
                        placeholder="Nhập số điện thoại" />
                    </Field>
                    <Field id="register-email" label="Email" icon={<Mail />} error={fieldErrors.email}>
                      <input id="register-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => updateField("email", event.target.value, setEmail)}
                        aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
                        placeholder="name@example.com" />
                    </Field>
                    <Field id="register-birthdate" label="Ngày sinh" icon={<CalendarDays />} error={fieldErrors.birthdate}>
                      <input id="register-birthdate" type="date" autoComplete="bday" value={birthdate}
                        max={today} onChange={(event) => updateField("birthdate", event.target.value, setBirthdate)}
                        aria-invalid={Boolean(fieldErrors.birthdate)} aria-describedby={fieldErrors.birthdate ? "register-birthdate-error" : undefined} />
                    </Field>
                    <Field id="register-gender" label="Giới tính" icon={<UserRound />} error={fieldErrors.gender}>
                      <select id="register-gender" autoComplete="sex" value={gender}
                        onChange={(event) => updateField("gender", event.target.value, (value) => setGender(value as Gender | ""))}
                        aria-invalid={Boolean(fieldErrors.gender)} aria-describedby={fieldErrors.gender ? "register-gender-error" : undefined}>
                        <option value="">Chọn giới tính</option><option value="female">Nữ</option><option value="male">Nam</option>
                      </select>
                    </Field>
                    <Field id="register-address" label="Địa chỉ" icon={<MapPin />} error={fieldErrors.address}>
                      <input id="register-address" autoComplete="street-address" maxLength={500} value={address}
                        onChange={(event) => updateField("address", event.target.value, setAddress)}
                        aria-invalid={Boolean(fieldErrors.address)} aria-describedby={fieldErrors.address ? "register-address-error" : undefined}
                        placeholder="Số nhà, đường, tỉnh/thành phố" />
                    </Field>
                  </div>

                  {role === "doctor" && (
                    <div className="auth-field-grid">
                      <Field id="register-workplace" label="Đơn vị công tác" icon={<Building2 />} error={fieldErrors.workplace}>
                        <input id="register-workplace" autoComplete="organization" maxLength={200} value={workplace}
                          onChange={(event) => updateField("workplace", event.target.value, setWorkplace)}
                          aria-invalid={Boolean(fieldErrors.workplace)} aria-describedby={fieldErrors.workplace ? "register-workplace-error" : undefined}
                          placeholder="Tên bệnh viện / cơ sở y tế" />
                      </Field>
                      <Field id="register-staff-code" label="Mã cán bộ / nhân viên y tế" icon={<BadgeCheck />} error={fieldErrors.staffCode}>
                        <input id="register-staff-code" maxLength={80} value={staffCode} onChange={(event) => updateField("staffCode", event.target.value, setStaffCode)}
                          aria-invalid={Boolean(fieldErrors.staffCode)} aria-describedby={fieldErrors.staffCode ? "register-staff-code-error" : undefined}
                          placeholder="Nhập mã cán bộ" />
                      </Field>
                    </div>
                  )}

                  <div className="auth-field-grid">
                    <Field id="register-password" label="Mật khẩu (ít nhất 8 ký tự)" icon={<LockKeyhole />} error={fieldErrors.password}>
                      <input id="register-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
                        onChange={(event) => updateField("password", event.target.value, setPassword)}
                        aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "register-password-error" : undefined}
                        placeholder="Tạo mật khẩu" />
                      <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
                        {showPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </Field>
                    <Field id="register-confirm-password" label="Xác nhận mật khẩu" icon={<LockKeyhole />} error={fieldErrors.confirmPassword}>
                      <input id="register-confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword}
                        onChange={(event) => updateField("confirmPassword", event.target.value, setConfirmPassword)}
                        aria-invalid={Boolean(fieldErrors.confirmPassword)} aria-describedby={fieldErrors.confirmPassword ? "register-confirm-password-error" : undefined}
                        placeholder="Nhập lại mật khẩu" />
                      <button className="auth-password-toggle" type="button" onClick={() => setShowConfirmPassword((value) => !value)}
                        aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"} aria-pressed={showConfirmPassword}>
                        {showConfirmPassword ? <EyeOff /> : <Eye />}
                      </button>
                    </Field>
                  </div>
                </>
              )}

              <button type="submit" className="auth-submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Đang xử lý..." : mode === "login" ? "ĐĂNG NHẬP" : "TẠO TÀI KHOẢN"}
              </button>
            </form>

            <p className="auth-switch">
              {mode === "login" ? "Bạn chưa có tài khoản?" : "Bạn đã có tài khoản?"}{" "}
              <Link to={mode === "login" ? "/register" : "/login"}>
                {mode === "login" ? "Đăng ký ngay" : "Đăng nhập"}
              </Link>
            </p>
            <p className="auth-disclaimer">
              Kết quả hỗ trợ sức khỏe không thay thế chẩn đoán hoặc tư vấn của nhân viên y tế.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
