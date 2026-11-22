import { useState, type FormEvent } from "react";
import { AlertCircle, BadgeCheck, Building2, CalendarDays, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../services/api";
import { authService } from "../../services/authService";
import type { Gender } from "../../types";
import { isStrongPassword, localISODate, parseDateOfBirth, PASSWORD_REQUIREMENT_MESSAGE } from "../../utils/validators";
import BrandPanel from "./components/BrandPanel";
import FormField from "./components/FormField";
import "./auth.css";

type RegistrationField = "name" | "phoneNumber" | "email" | "birthdate" | "gender" | "address" |
  "password" | "confirmPassword" | "workplace" | "staffCode";
type FieldErrors = Partial<Record<RegistrationField, string>>;
const registrationFields: RegistrationField[] = [
  "name", "phoneNumber", "email", "birthdate", "gender", "address", "password",
  "confirmPassword", "workplace", "staffCode",
];

/** Thông báo theo đặc tả UC-01 (5b) khi Email hoặc SĐT đã có người dùng. */
const DUPLICATE_MESSAGE = "Email/SĐT đã được đăng ký, vui lòng sử dụng Email/SĐT khác";
const duplicatePattern = /tồn tại|đã được|đã đăng|đã sử dụng|đã có|trùng|exist|already|duplicate|taken/i;

export default function RegisterPage() {
  const navigate = useNavigate();
  const today = localISODate();
  const [role, setRole] = useState<"user" | "doctor">("user");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [address, setAddress] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  function updateField(field: RegistrationField, value: string, update: (value: string) => void) {
    update(value);
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setError("");
  }

  /** Gộp các thuộc tính lặp lại của một ô nhập (id, giá trị, sự kiện, aria). */
  function bind(field: RegistrationField, id: string, value: string, update: (value: string) => void) {
    return {
      id,
      value,
      onChange: (event: { target: { value: string } }) => updateField(field, event.target.value, update),
      "aria-invalid": Boolean(fieldErrors[field]),
      "aria-describedby": fieldErrors[field] ? `${id}-error` : undefined,
    };
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (name.trim().length < 2 || name.trim().length > 120) errors.name = "Họ tên cần có từ 2 đến 120 ký tự.";
    if (!/^\+?[\d\s().-]{8,20}$/.test(phoneNumber.trim())) errors.phoneNumber = "Nhập số điện thoại hợp lệ (8–20 ký tự).";
    if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Nhập địa chỉ email hợp lệ (tối đa 254 ký tự).";
    const birthdateIso = parseDateOfBirth(birthdate);
    if (!birthdateIso || birthdateIso > today) {
      errors.birthdate = "Chọn ngày sinh hợp lệ, không ở tương lai.";
    }
    if (!gender) errors.gender = "Vui lòng chọn giới tính.";
    if (!address.trim() || address.trim().length > 500) errors.address = "Nhập địa chỉ (tối đa 500 ký tự).";
    if (!isStrongPassword(password)) errors.password = PASSWORD_REQUIREMENT_MESSAGE;
    if (password !== confirmPassword) errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    if (role === "doctor" && (workplace.trim().length < 2 || workplace.trim().length > 200)) errors.workplace = "Vui lòng nhập đơn vị công tác (2–200 ký tự).";
    if (role === "doctor" && (staffCode.trim().length < 2 || staffCode.trim().length > 80)) errors.staffCode = "Vui lòng nhập mã số cán bộ / nhân viên y tế (2–80 ký tự).";
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (busy) return;

    const validationErrors = validate();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    setBusy(true);
    try {
      await authService.register({
        role,
        name: name.trim(),
        phoneNumber: phoneNumber.trim(),
        email: email.trim().toLowerCase(),
        birthdate: parseDateOfBirth(birthdate)!,
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
        for (const field of registrationFields) {
          if (cause.fieldErrors[field]) mappedErrors[field] = cause.fieldErrors[field];
        }
        // Email hoặc SĐT đã tồn tại: dùng đúng câu thông báo trong đặc tả.
        const duplicate = duplicatePattern.test(mappedErrors.email ?? "")
          || duplicatePattern.test(mappedErrors.phoneNumber ?? "")
          || (duplicatePattern.test(cause.message) && /email|sđt|số điện thoại|phone/i.test(cause.message));
        if (duplicate) {
          if (mappedErrors.email) mappedErrors.email = DUPLICATE_MESSAGE;
          if (mappedErrors.phoneNumber) mappedErrors.phoneNumber = DUPLICATE_MESSAGE;
          setFieldErrors(mappedErrors);
          setError(DUPLICATE_MESSAGE);
        } else {
          setFieldErrors(mappedErrors);
          setError(cause.message);
        }
      } else {
        setError("Không thể đăng ký tài khoản.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fg-page">
      <div className="fg-shell rg-shell">
        <BrandPanel />

        <section className="fg-card rg-card" aria-labelledby="register-heading">
          <h2 id="register-heading">ĐĂNG KÝ TÀI KHOẢN</h2>

          <div className="rg-tabs" role="group" aria-label="Loại tài khoản">
            <button type="button" className="rg-tab" aria-pressed={role === "user"} onClick={() => setRole("user")}>
              Người dùng phổ thông
            </button>
            <button type="button" className="rg-tab" aria-pressed={role === "doctor"} onClick={() => setRole("doctor")}>
              Cán bộ y tế
            </button>
          </div>
          <p className="fg-subtitle">Vui lòng nhập đầy đủ thông tin để tạo tài khoản mới</p>

          <form className="fg-form" onSubmit={(event) => void submit(event)} noValidate>
            {error && (
              <div role="alert" className="fg-alert fg-alert-error">
                <AlertCircle aria-hidden="true" /><span>{error}</span>
              </div>
            )}

            <FormField id="register-name" icon={<UserRound />} error={fieldErrors.name}>
              <input {...bind("name", "register-name", name, setName)} autoComplete="name" maxLength={120}
                aria-label="Họ và tên" placeholder="Họ và tên" />
            </FormField>

            <FormField id="register-phone" icon={<Phone />} error={fieldErrors.phoneNumber}>
              <input {...bind("phoneNumber", "register-phone", phoneNumber, setPhoneNumber)} type="tel" autoComplete="tel" maxLength={20}
                aria-label="Số điện thoại" placeholder="Số điện thoại" />
            </FormField>

            <FormField id="register-email" icon={<Mail />} error={fieldErrors.email}>
              <input {...bind("email", "register-email", email, setEmail)} type="email" autoComplete="email" maxLength={254}
                aria-label="Email" placeholder="Email" />
            </FormField>

            <div className="rg-birth-row">
              <FormField id="register-birthdate" icon={<CalendarDays />} error={fieldErrors.birthdate}>
                <input {...bind("birthdate", "register-birthdate", birthdate, setBirthdate)} type="text" inputMode="numeric"
                  autoComplete="bday" maxLength={10} placeholder="dd/mm/yyyy" aria-label="Ngày sinh (dd/mm/yyyy)" />
              </FormField>
              <fieldset className="rg-gender">
                <legend className="sr-only">Giới tính</legend>
                <label className="rg-radio">
                  <input type="radio" name="gender" value="male" checked={gender === "male"}
                    onChange={() => updateField("gender", "male", (value) => setGender(value as Gender))} />
                  <span>Nam</span>
                </label>
                <label className="rg-radio">
                  <input type="radio" name="gender" value="female" checked={gender === "female"}
                    onChange={() => updateField("gender", "female", (value) => setGender(value as Gender))} />
                  <span>Nữ</span>
                </label>
              </fieldset>
              {fieldErrors.gender && <p className="rg-gender-error" id="register-gender-error">{fieldErrors.gender}</p>}
            </div>

            <FormField id="register-address" icon={<MapPin />} error={fieldErrors.address}>
              <input {...bind("address", "register-address", address, setAddress)} autoComplete="street-address" maxLength={500}
                aria-label="Địa chỉ" placeholder="Địa chỉ" />
            </FormField>

            {role === "doctor" && (
              <>
                <FormField id="register-workplace" icon={<Building2 />} error={fieldErrors.workplace}>
                  <input {...bind("workplace", "register-workplace", workplace, setWorkplace)} autoComplete="organization" maxLength={200}
                    aria-label="Đơn vị công tác (Bệnh viện/Trạm y tế)" placeholder="Đơn vị công tác (Bệnh viện/Trạm y tế)" />
                </FormField>
                <FormField id="register-staff-code" icon={<BadgeCheck />} error={fieldErrors.staffCode}>
                  <input {...bind("staffCode", "register-staff-code", staffCode, setStaffCode)} maxLength={80}
                    aria-label="Mã số cán bộ/nhân viên y tế" placeholder="Mã số cán bộ/nhân viên y tế" />
                </FormField>
              </>
            )}

            <FormField id="register-password" icon={<KeyRound />} error={fieldErrors.password}>
              <input {...bind("password", "register-password", password, setPassword)} type={showPassword ? "text" : "password"} autoComplete="new-password"
                aria-label="Mật khẩu (ít nhất 8 ký tự)" placeholder="Mật khẩu" />
              <button className="fg-eye" type="button" onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword}>
                {showPassword ? <Eye /> : <EyeOff />}
              </button>
            </FormField>
            <FormField id="register-confirm-password" icon={<LockKeyhole />} error={fieldErrors.confirmPassword}>
              <input {...bind("confirmPassword", "register-confirm-password", confirmPassword, setConfirmPassword)} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password"
                aria-label="Xác nhận mật khẩu" placeholder="Xác nhận mật khẩu" />
              <button className="fg-eye" type="button" onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"} aria-pressed={showConfirmPassword}>
                {showConfirmPassword ? <Eye /> : <EyeOff />}
              </button>
            </FormField>

            <button type="submit" className="fg-submit" disabled={busy}>
              {busy && <Loader2 className="fg-spin" aria-hidden="true" />}
              {busy ? "Đang xử lý..." : "Tạo tài khoản"}
            </button>
          </form>

          <p className="fg-switch">
            Bạn đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
