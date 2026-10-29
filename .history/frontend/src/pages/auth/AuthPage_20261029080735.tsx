import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Building2, BadgeCheck, KeyRound, Loader2, Lock, Mail, MapPin, Phone, User } from "lucide-react";
import AuthLayout from "../../components/AuthLayout";
import { DateInput, FormInput, Notice, PasswordInput, focusFirstError } from "../../components/FormControls";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { authService, ROLE_HOME } from "../../services/authService";
import type { ApiFieldErrors, Gender, RegisterPayload } from "../../types";
import { passwordIssue, validBirthdate, validEmail, validPhone } from "../../utils/validators";

/* ------------------------------------------------------------------ */
/* Đăng nhập                                                          */
/* ------------------------------------------------------------------ */

function LoginForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const registered = (location.state as { registered?: boolean } | null)?.registered;

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  function validate(): ApiFieldErrors {
    const e: ApiFieldErrors = {};
    const id = identifier.trim();
    if (!id) e.identifier = "Vui lòng nhập email hoặc số điện thoại";
    else if (!validEmail(id) && !validPhone(id)) e.identifier = "Email hoặc số điện thoại không hợp lệ";
    if (!password) e.password = "Vui lòng nhập mật khẩu";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting.current) return; // chống gửi lặp
    setFormError("");
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      focusFirstError(["login-identifier", "login-password"].filter((_, i) => [e.identifier, e.password][i]));
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const user = await login({ identifier, password, remember });
      // Điều hướng theo role do backend xác nhận
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(
          err.status === 401
            ? "Tên đăng nhập hoặc mật khẩu không chính xác"
            : err.status === 403
              ? err.message || "Tài khoản của bạn đã bị khóa"
              : err.message,
        );
      } else {
        setFormError("Đã có lỗi xảy ra, vui lòng thử lại.");
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[440px] rounded-xl border-2 border-[#7aa8ee] bg-white px-6 py-7 shadow-card sm:px-10 sm:py-9">
      <h2 className="text-center text-[26px] font-extrabold tracking-wide text-[#4f84d6]">ĐĂNG NHẬP</h2>
      <p className="mt-3 text-center text-[12.5px] text-slate-600">Vui lòng tiếp tục đăng nhập để sử dụng hệ thống</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        {registered && <Notice tone="success">Đăng ký thành công. Vui lòng đăng nhập.</Notice>}
        {formError && <Notice tone="error">{formError}</Notice>}

        <FormInput
          id="login-identifier"
          label="Tên đăng nhập/Email"
          icon={User}
          placeholder="Tên đăng nhập/Email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
        />
        <PasswordInput
          id="login-password"
          label="Mật khẩu"
          icon={KeyRound}
          placeholder="Mật khẩu"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <div className="flex items-center justify-between gap-2 text-[11.5px]">
          <label className="flex cursor-pointer items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 accent-[#4f84d6]"
            />
            Ghi nhớ đăng nhập
          </label>
          <button type="button" onClick={() => setShowForgot((s) => !s)} className="text-[#4f84d6] underline underline-offset-2 hover:text-brand-700">
            Quên mật khẩu ?
          </button>
        </div>
        {showForgot && (
          <Notice tone="info">
            Hệ thống chưa có chức năng khôi phục mật khẩu tự động. Vui lòng liên hệ quản trị viên để được hỗ trợ.
          </Notice>
        )}

        <button type="submit" disabled={loading} className="auth-btn mt-2 w-full py-3 text-[17px]">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-slate-600">
        Bạn chưa có tài khoản?{" "}
        <Link to="/register" className="text-[#4f84d6] underline underline-offset-2 hover:text-brand-700">
          Đăng kí
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Đăng ký                                                            */
/* ------------------------------------------------------------------ */

type RegRole = "user" | "doctor";

interface RegState {
  name: string;
  phoneNumber: string;
  email: string;
  birthdate: string;
  gender: Gender | "";
  address: string;
  password: string;
  confirmPassword: string;
  workplace: string;
  staffCode: string;
}

const EMPTY: RegState = {
  name: "", phoneNumber: "", email: "", birthdate: "", gender: "", address: "",
  password: "", confirmPassword: "", workplace: "", staffCode: "",
};

const FIELD_IDS: Record<keyof RegState, string> = {
  name: "reg-name", phoneNumber: "reg-phone", email: "reg-email", birthdate: "reg-birth", gender: "reg-gender-male",
  address: "reg-address", password: "reg-password", confirmPassword: "reg-confirm", workplace: "reg-workplace", staffCode: "reg-staff",
};
const ORDER: (keyof RegState)[] = ["name", "phoneNumber", "email", "birthdate", "gender", "address", "workplace", "staffCode", "password", "confirmPassword"];

function RegisterForm() {
  const navigate = useNavigate();
  const [role, setRole] = useState<RegRole>("user");
  const [f, setF] = useState<RegState>(EMPTY);
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const set = <K extends keyof RegState>(k: K, v: RegState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };

  function validate(): ApiFieldErrors {
    const e: ApiFieldErrors = {};
    if (f.name.trim().length < 2) e.name = "Vui lòng nhập họ và tên";
    if (!f.phoneNumber.trim()) e.phoneNumber = "Vui lòng nhập số điện thoại";
    else if (!validPhone(f.phoneNumber)) e.phoneNumber = "Số điện thoại không hợp lệ";
    if (!f.email.trim()) e.email = "Vui lòng nhập email";
    else if (!validEmail(f.email)) e.email = "Email không hợp lệ";
    const bd = validBirthdate(f.birthdate);
    if (bd) e.birthdate = bd;
    if (!f.gender) e.gender = "Vui lòng chọn giới tính";
    if (!f.address.trim()) e.address = "Vui lòng nhập địa chỉ";
    if (role === "doctor") {
      if (!f.workplace.trim()) e.workplace = "Vui lòng nhập đơn vị công tác";
      if (!f.staffCode.trim()) e.staffCode = "Vui lòng nhập mã số cán bộ/nhân viên y tế";
    }
    if (!f.password) e.password = "Vui lòng nhập mật khẩu";
    else {
      const pi = passwordIssue(f.password);
      if (pi) e.password = pi;
    }
    if (!f.confirmPassword) e.confirmPassword = "Vui lòng xác nhận mật khẩu";
    else if (f.confirmPassword !== f.password) e.confirmPassword = "Mật khẩu xác nhận không khớp";
    return e;
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting.current || success) return; // chống gửi lặp
    setFormError("");
    const e = validate();
    setErrors(e);
    const bad = ORDER.filter((k) => e[k]);
    if (bad.length) {
      focusFirstError(bad.map((k) => FIELD_IDS[k]));
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const payload: RegisterPayload = {
        role, // chỉ "user" | "doctor"; backend vẫn tự chặn mọi nỗ lực tạo admin
        name: f.name, phoneNumber: f.phoneNumber, email: f.email, birthdate: f.birthdate,
        gender: f.gender as Gender, address: f.address, password: f.password, confirmPassword: f.confirmPassword,
        ...(role === "doctor" ? { workplace: f.workplace, staffCode: f.staffCode } : {}),
      };
      await authService.register(payload);
      // Chỉ thông báo thành công khi API xác nhận thành công
      setSuccess(true);
      window.setTimeout(() => navigate("/login", { replace: true, state: { registered: true } }), 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 trùng email/SĐT/mã cán bộ: backend nên trả fieldErrors; nếu không, hiển thị thông báo chung
        const fe = err.fieldErrors;
        setErrors(fe);
        const focusKeys = ORDER.filter((k) => fe[k]);
        if (focusKeys.length) focusFirstError(focusKeys.map((k) => FIELD_IDS[k]));
        if (!focusKeys.length || err.status >= 500 || err.status === 0) {
          setFormError(
            err.status === 409
              ? "Email/SĐT đã được đăng ký, vui lòng sử dụng Email/SĐT khác"
              : err.message,
          );
        }
      } else {
        setFormError("Đã có lỗi xảy ra, vui lòng thử lại.");
      }
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const tab = (r: RegRole, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={role === r}
      onClick={() => {
        setRole(r);
        setErrors({});
      }}
      className={`flex-1 rounded-[3px] px-2 py-1.5 text-[12.5px] transition ${
        role === r ? "bg-[#8fb2e8] font-semibold text-slate-800" : "bg-[#e1ecfa] text-slate-600 hover:bg-[#d3e3f8]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[520px] rounded-xl border-2 border-[#c5defc] bg-white px-5 py-5 shadow-card sm:px-7 sm:py-6">
      <h2 className="text-center text-[26px] font-extrabold tracking-wide text-[#4f84d6]">ĐĂNG KÝ TÀI KHOẢN</h2>

      <div role="tablist" aria-label="Loại tài khoản" className="mt-4 flex gap-0 overflow-hidden rounded-[3px]">
        {tab("user", "Người dùng phổ thông")}
        {tab("doctor", "Cán bộ y tế")}
      </div>
      <p className="mt-3 text-center text-[12px] text-slate-500">Vui lòng nhập đầy đủ thông tin để tạo tài khoản mới</p>

      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-2.5">
        {formError && <Notice tone="error">{formError}</Notice>}
        {success && <Notice tone="success">Đăng ký thành công! Đang chuyển sang trang đăng nhập...</Notice>}

        <FormInput id="reg-name" label="Họ và tên" icon={User} placeholder="Họ và tên" autoComplete="name"
          value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} />
        <FormInput id="reg-phone" label="Số điện thoại" icon={Phone} placeholder="Số điện thoại" type="tel" inputMode="tel" autoComplete="tel"
          value={f.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} error={errors.phoneNumber} />
        <FormInput id="reg-email" label="Email" icon={Mail} placeholder="Email" type="email" autoComplete="email"
          value={f.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />

        <div>
          <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <DateInput id="reg-birth" label="Ngày sinh" placeholder="Ngày sinh" autoComplete="bday"
              value={f.birthdate} onChange={(v) => set("birthdate", v)} error={errors.birthdate} />
            <div role="radiogroup" aria-label="Giới tính" className="flex h-10 items-center gap-5 px-1 text-[12.5px] text-slate-600">
              {([["male", "Nam"], ["female", "Nữ"]] as const).map(([v, l]) => (
                <label key={v} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    id={`reg-gender-${v}`}
                    type="radio"
                    name="gender"
                    value={v}
                    checked={f.gender === v}
                    onChange={() => set("gender", v)}
                    className="h-4 w-4 accent-[#4f84d6]"
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>
          {errors.gender && <p role="alert" className="mt-1 text-xs text-red-500">{errors.gender}</p>}
        </div>

        <FormInput id="reg-address" label="Địa chỉ" icon={MapPin} placeholder="Địa chỉ" autoComplete="street-address"
          value={f.address} onChange={(e) => set("address", e.target.value)} error={errors.address} />

        {role === "doctor" && (
          <>
            <FormInput id="reg-workplace" label="Đơn vị công tác" icon={Building2} placeholder="Đơn vị công tác (Bệnh viện/Trạm y tế)"
              value={f.workplace} onChange={(e) => set("workplace", e.target.value)} error={errors.workplace} />
            <FormInput id="reg-staff" label="Mã số cán bộ/nhân viên y tế" icon={BadgeCheck} placeholder="Mã số cán bộ/nhân viên y tế"
              value={f.staffCode} onChange={(e) => set("staffCode", e.target.value)} error={errors.staffCode} />
          </>
        )}

        <PasswordInput id="reg-password" label="Mật khẩu" icon={KeyRound} placeholder="Mật khẩu" autoComplete="new-password"
          value={f.password} onChange={(e) => set("password", e.target.value)} error={errors.password} />
        <PasswordInput id="reg-confirm" label="Xác nhận mật khẩu" icon={Lock} placeholder="Xác nhận mật khẩu" autoComplete="new-password"
          value={f.confirmPassword} onChange={(e) => set("confirmPassword", e.target.value)} error={errors.confirmPassword} />

        <div className="pt-1 text-center">
          <button type="submit" disabled={loading || success} className="auth-btn min-w-[150px]">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Đang xử lý..." : "Đăng kí"}
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-[12.5px] text-slate-600">
        Đã có tài khoản?{" "}
        <Link to="/login" className="text-[#4f84d6] underline underline-offset-2 hover:text-brand-700">
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, loading } = useAuth();
  // Đã đăng nhập (role do backend xác nhận) thì không ở lại màn hình xác thực
  if (!loading && user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <AuthLayout>{mode === "login" ? <LoginForm /> : <RegisterForm />}</AuthLayout>;
}
