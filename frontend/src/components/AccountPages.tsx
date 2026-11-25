import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Camera, CheckCircle2, CircleAlert, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/api";
import { authService } from "../services/authService";
import { formatDate, formatDateOfBirth, isStrongPassword, localISODate, normalizePhoneNumber, parseDateOfBirth, PASSWORD_REQUIREMENT_MESSAGE } from "../utils/validators";
import UserAvatar from "./UserAvatar";
import "../dashboard.css";

/** Trang lịch sử dự đoán cá nhân nằm ở HistoryPages.tsx; xuất lại đây để App.tsx không phải sửa import. */
export { OwnHistoryPage } from "./HistoryPages";

type Message = { tone: "error" | "success"; text: string };

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  doctor: "Cán bộ y tế",
  user: "Người dùng phổ thông",
};

/** Khối thông báo lỗi / thành công, cùng kiểu với trang dự đoán. */
function MessageBox({ message }: { message: Message | null }) {
  if (!message) return null;
  const isError = message.tone === "error";
  return (
    <div role={isError ? "alert" : "status"} className={`dg-notice ${isError ? "dg-notice--error" : "dg-notice--success"}`}>
      {isError ? <CircleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
      <span>{message.text}</span>
    </div>
  );
}

/** Một mục = một hàng: tên + mô tả bên trái, ô nhập bên phải (giống trang dự đoán). */
function Row({ label, hint, htmlFor, error, children }: {
  label: string;
  hint?: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="dg-row">
      <div className="dg-row-text">
        <label className="dg-row-label" htmlFor={htmlFor}>{label}</label>
        {hint && <p className="dg-row-hint">{hint}</p>}
      </div>
      <div className="dg-row-control dg-row-control--text">
        {children}
        {error && <p className="dg-field-error" id={`${htmlFor}-error`}>{error}</p>}
      </div>
    </div>
  );
}

/** Ô mật khẩu có nút hiện / ẩn. */
function PasswordInput({ id, value, onChange, autoComplete, minLength, invalid }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="dg-pw">
      <input id={id} className="dg-input" type={show ? "text" : "password"} autoComplete={autoComplete} placeholder="********" value={value}
        onChange={(event) => onChange(event.target.value)} minLength={minLength} required
        aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} />
      <button type="button" className="dg-pw-toggle" onClick={() => setShow((previous) => !previous)}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={show}>
        {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [birthdate, setBirthdate] = useState(formatDateOfBirth(user?.birthdate));
  const [gender, setGender] = useState(user?.gender || "");
  const [address, setAddress] = useState(user?.address || "");
  const [staffCode, setStaffCode] = useState(user?.staffCode || "");
  const [workplace, setWorkplace] = useState(user?.workplace || "");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const isDoctor = user?.role === "doctor";

  useEffect(() => {
    setName(user?.name || "");
    setPhoneNumber(user?.phoneNumber || "");
    setBirthdate(formatDateOfBirth(user?.birthdate));
    setGender(user?.gender || "");
    setAddress(user?.address || "");
    setStaffCode(user?.staffCode || "");
    setWorkplace(user?.workplace || "");
  }, [user]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function chooseAvatar(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({ tone: "error", text: "Chỉ hỗ trợ ảnh JPG, JPEG, PNG hoặc WEBP." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ tone: "error", text: "Ảnh đại diện không được vượt quá 5 MB." });
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarZoom(1);
    setMessage(null);
  }

  async function croppedAvatar(): Promise<File> {
    if (!avatarFile || !avatarPreview) throw new Error("Vui lòng chọn ảnh đại diện.");
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể đọc ảnh đã chọn."));
      image.src = avatarPreview;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight) / avatarZoom;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không hỗ trợ chỉnh sửa ảnh.");
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Không thể xử lý ảnh đại diện.")), "image/jpeg", 0.9);
    });
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  }

  async function saveAvatar() {
    if (!avatarFile || avatarBusy) return;
    setAvatarBusy(true);
    setMessage(null);
    try {
      await authService.uploadAvatar(await croppedAvatar());
      await refreshUser();
      setAvatarFile(null);
      setAvatarPreview("");
      if (avatarInput.current) avatarInput.current.value = "";
      setMessage({ tone: "success", text: "Ảnh đại diện đã được cập nhật." });
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Không thể cập nhật ảnh đại diện." });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (avatarBusy || !user?.avatar) return;
    setAvatarBusy(true);
    setMessage(null);
    try {
      await authService.deleteAvatar();
      await refreshUser();
      setMessage({ tone: "success", text: "Đã xóa ảnh đại diện." });
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof ApiError ? cause.message : "Không thể xóa ảnh đại diện." });
    } finally {
      setAvatarBusy(false);
    }
  }

  const dirty = name !== (user?.name || "")
    || phoneNumber !== (user?.phoneNumber || "")
    || birthdate !== formatDateOfBirth(user?.birthdate)
    || gender !== (user?.gender || "")
    || address !== (user?.address || "")
    || (isDoctor && staffCode !== (user?.staffCode || ""))
    || (isDoctor && workplace !== (user?.workplace || ""));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const birthdateIso = birthdate ? parseDateOfBirth(birthdate) : "";
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (normalizedPhone === null) {
      setMessage({ tone: "error", text: "Nhập số điện thoại hợp lệ (8–15 chữ số)." });
      return;
    }
    if (birthdate && !birthdateIso) {
      setMessage({ tone: "error", text: "Ngày sinh không hợp lệ. Vui lòng nhập theo định dạng dd/mm/yyyy." });
      return;
    }
    if (birthdateIso && birthdateIso > localISODate()) {
      setMessage({ tone: "error", text: "Ngày sinh không thể ở tương lai." });
      return;
    }
    if (gender !== "male" && gender !== "female") {
      setMessage({ tone: "error", text: "Vui lòng chọn giới tính Nam hoặc Nữ trước khi lưu thông tin." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await authService.updateProfile({
        name, phoneNumber: normalizedPhone, birthdate: birthdateIso || "", gender: gender === "male" || gender === "female" ? gender : undefined, address,
        ...(isDoctor ? { staffCode: staffCode.trim(), workplace: workplace.trim() } : {}),
      });
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
      <div className="dg-sections dg-wrap">
        <MessageBox message={message} />

        {/* Thanh thông tin tài khoản nằm ngang ở phía trên */}
        <div className="dg-profile-banner">
          <div className="dg-profile-banner-left">
            <div className="dg-profile-avatar">
              {avatarPreview
                ? <img className="dg-avatar dg-avatar--lg" src={avatarPreview} alt="Xem trước ảnh đại diện" />
                : <UserAvatar name={user?.name} src={user?.avatar} className="dg-avatar dg-avatar--lg" />}
              <input ref={avatarInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  chooseAvatar(event.target.files?.[0]);
                  event.target.value = "";
                }} />
              <button type="button" className="dg-avatar-upload" onClick={() => avatarInput.current?.click()} disabled={avatarBusy}
                aria-label={avatarFile ? "Chọn ảnh đại diện khác" : "Tải ảnh đại diện"} title="Tải ảnh đại diện">
                {avatarBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
              </button>
            </div>
            <div className="dg-profile-identity">
              <p className="dg-aside-name">{user?.name}</p>
              <p className="dg-aside-sub">{user?.email}</p>
              {avatarPreview && (
                <div className="dg-avatar-pending">
                  <label className="dg-avatar-zoom">
                    Thu phóng ảnh
                    <input type="range" min="1" max="3" step="0.05" value={avatarZoom}
                      onChange={(event) => setAvatarZoom(Number(event.target.value))} />
                  </label>
                  <div className="dg-avatar-actions">
                    <button type="button" className="btn-primary" onClick={() => void saveAvatar()} disabled={avatarBusy}>
                      {avatarBusy && <Loader2 className="h-4 w-4 animate-spin" />} Lưu ảnh
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => { setAvatarFile(null); setAvatarPreview(""); }} disabled={avatarBusy}>
                      Hủy
                    </button>
                  </div>
                </div>
              )}
              {!avatarPreview && user?.avatar && (
                <button type="button" className="dg-avatar-remove" onClick={() => void removeAvatar()} disabled={avatarBusy}>
                  {avatarBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />} Xóa ảnh
                </button>
              )}
            </div>
          </div>
          <div className="dg-profile-banner-right">
            <div className="dg-profile-meta-item">
              <span className="dg-profile-meta-label">Vai trò</span>
              <span className="dg-profile-meta-value">{ROLE_LABELS[user?.role ?? "user"] ?? "Người dùng"}</span>
            </div>
            {isDoctor && user?.staffCode && (
              <div className="dg-profile-meta-item">
                <span className="dg-profile-meta-label">Mã cán bộ</span>
                <span className="dg-profile-meta-value">{user.staffCode}</span>
              </div>
            )}
            {user?.createdAt && (
              <div className="dg-profile-meta-item">
                <span className="dg-profile-meta-label">Ngày tạo</span>
                <span className="dg-profile-meta-value">{formatDate(user.createdAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form chỉnh sửa thông tin */}
        <form onSubmit={submit}>
          <div className="dg-card">
            <Row label="Họ và tên" htmlFor="profile-name">
              <input id="profile-name" className="dg-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
            </Row>
            <Row label="Email" hint="Dùng để đăng nhập, không thể thay đổi" htmlFor="profile-email">
              <input id="profile-email" className="dg-input" value={user?.email || ""} readOnly />
            </Row>
            {isDoctor && (
              <>
                <Row label="Mã cán bộ / nhân viên y tế" hint="Mã số do cơ sở y tế cấp" htmlFor="profile-staff-code">
                  <input id="profile-staff-code" className="dg-input" value={staffCode} onChange={(event) => setStaffCode(event.target.value)}
                    required minLength={2} maxLength={80} />
                </Row>
                <Row label="Đơn vị công tác" hint="Bệnh viện hoặc trạm y tế" htmlFor="profile-workplace">
                  <input id="profile-workplace" className="dg-input" value={workplace} onChange={(event) => setWorkplace(event.target.value)} required maxLength={200} />
                </Row>
              </>
            )}
            <Row label="Số điện thoại" htmlFor="profile-phone">
              <input id="profile-phone" className="dg-input" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
            </Row>
            <Row label="Ngày sinh" htmlFor="profile-birthdate">
              <input id="profile-birthdate" className="dg-input" type="text" inputMode="numeric" maxLength={10}
                placeholder="dd/mm/yyyy" value={birthdate} onChange={(event) => setBirthdate(event.target.value)} />
            </Row>
            <Row label="Giới tính" htmlFor="profile-gender">
              <select id="profile-gender" className="dg-input" value={gender} onChange={(event) => setGender(event.target.value)}>
                <option value="">Chọn giới tính</option><option value="male">Nam</option><option value="female">Nữ</option>
              </select>
            </Row>
            <Row label="Địa chỉ" htmlFor="profile-address">
              <input id="profile-address" className="dg-input" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} />
            </Row>
            <div className="dg-card-foot">
              <span className="dg-foot-note">{dirty ? "Có thay đổi chưa lưu" : "Chưa có thay đổi"}</span>
              <button className="dg-submit" disabled={busy || !dirty}>
                {busy && <Loader2 className="dg-spin" aria-hidden="true" />} Lưu thay đổi
              </button>
            </div>
          </div>
        </form>
        <PasswordCard />
      </div>
    </div>
  );
}

function PasswordCard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const mismatch = confirmPassword !== "" && newPassword !== confirmPassword;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!isStrongPassword(newPassword)) {
      setMessage({ tone: "error", text: PASSWORD_REQUIREMENT_MESSAGE });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ tone: "error", text: "Mật khẩu mới và xác nhận không khớp." });
      return;
    }
    setBusy(true);
    try {
      await authService.changePassword({ currentPassword, newPassword, confirmPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ tone: "success", text: "Đổi mật khẩu thành công. Phiên đăng nhập hiện tại sẽ kết thúc." });
      window.setTimeout(() => {
        void signOut().finally(() => navigate("/login", { replace: true }));
      }, 1200);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage({ tone: "error", text: error.fieldErrors.currentPassword || error.fieldErrors.confirmPassword || error.fieldErrors.newPassword || error.message });
      } else {
        setMessage({ tone: "error", text: "Không thể đổi mật khẩu." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dg-card dg-security-card" aria-labelledby="security-title">
      <div className="dg-security-heading">
        <div>
          <h2 id="security-title">Bảo mật tài khoản</h2>
          <p>Cập nhật mật khẩu đăng nhập của bạn</p>
        </div>
      </div>
      <MessageBox message={message} />
      <form onSubmit={submit}>
        <Row label="Mật khẩu hiện tại" htmlFor="current-password">
          <PasswordInput id="current-password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword} />
        </Row>
        <Row label="Mật khẩu mới" hint="Sử dụng ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt" htmlFor="new-password">
          <PasswordInput id="new-password" autoComplete="new-password" value={newPassword} onChange={setNewPassword} minLength={8} />
        </Row>
        <Row label="Xác nhận mật khẩu mới" htmlFor="confirm-password" error={mismatch ? "Mật khẩu xác nhận chưa khớp." : undefined}>
          <PasswordInput id="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword}
            minLength={8} invalid={mismatch} />
        </Row>
        <div className="dg-card-foot">
          <span className="dg-foot-note">Mật khẩu của bạn được mã hóa khi lưu.</span>
          <button className="dg-submit" type="submit" disabled={busy}>
            {busy && <Loader2 className="dg-spin" aria-hidden="true" />} Cập nhật mật khẩu
          </button>
        </div>
      </form>
    </section>
  );
}
