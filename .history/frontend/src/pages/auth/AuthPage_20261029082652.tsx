import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User as UserIcon, 
  Phone, 
  Mail, 
  Calendar, 
  MapPin, 
  Lock, 
  Eye, 
  EyeOff, 
  Building2, 
  BadgeCheck, 
  AlertCircle 
} from 'lucide-react';
import { authService } from '../../services/authService';

export const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [roleTab, setRoleTab] = useState<'user' | 'doctor'>('user');

  // Trạng thái Form Đăng nhập
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Trạng thái Form Đăng ký
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [address, setAddress] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const response = await authService.login(loginIdentifier, loginPassword, rememberMe);
      const userRole = response.user.role;
      if (userRole === 'admin') navigate('/admin/accounts');
      else if (userRole === 'doctor') navigate('/doctor/predict');
      else navigate('/user/predict');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (registerPassword !== confirmPassword) {
      setErrorMessage('Mật khẩu và xác nhận mật khẩu không khớp.');
      return;
    }

    setLoading(true);
    try {
      await authService.register({
        name: fullName,
        phoneNumber: phone,
        email,
        birthdate,
        gender,
        address,
        password: registerPassword,
        role: roleTab,
        workplace: roleTab === 'doctor' ? workplace : undefined,
        staffCode: roleTab === 'doctor' ? staffCode : undefined,
      });

      alert('Đăng ký tài khoản thành công! Vui lòng đăng nhập.');
      setIsLogin(true);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#EBF5FB] via-[#E3F2FD] to-[#D6EAF8] flex items-center justify-center p-4 md:p-8 font-sans">
      {/* Container chính */}
      <div className="w-full max-w-4xl bg-white/95 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden grid grid-cols-1 md:grid-cols-12 border border-blue-100">
        
        {/* CỘT TRÁI: Brand & Medical Artwork */}
        <div className="md:col-span-5 bg-gradient-to-b from-[#E1F5FE] to-[#B3E5FC] p-8 flex flex-col justify-between items-center text-center relative overflow-hidden border-r border-blue-50">
          <div className="z-10 w-full flex flex-col items-center mt-4">
            {/* Logo Biểu tượng */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#29B6F6] to-[#0288D1] flex items-center justify-center shadow-lg shadow-sky-300/50 mb-4 text-white">
              <svg className="w-12 h-12 fill-current" viewBox="0 0 24 24">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-[#0D47A1] tracking-tight">
              DiaRisk <span className="text-[#0288D1]">VN</span>
            </h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed px-4">
              Phân tích dữ liệu – Dự đoán nguy cơ
              <br />
              Đồng hành cùng bạn phòng ngừa đái tháo đường
            </p>
          </div>

          {/* Minh họa máy đo đường huyết */}
          <div className="z-10 my-6 flex flex-col items-center">
            <div className="w-32 h-44 bg-slate-800 rounded-3xl p-2.5 shadow-2xl border-4 border-slate-700 flex flex-col items-center justify-between relative">
              <div className="w-full h-24 bg-[#E0F2F1] rounded-2xl flex flex-col items-center justify-center p-2 shadow-inner">
                <span className="text-2xl font-black text-slate-800">5.8</span>
                <span className="text-[10px] text-slate-500 font-semibold uppercase">mmol/L</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-sky-400"></div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <span className="inline-block w-3 h-3 rounded-full bg-sky-400 animate-pulse"></span>
              <span className="inline-block w-3 h-3 rounded-full bg-teal-400"></span>
            </div>
          </div>

          <div className="z-10 text-[11px] text-slate-400 font-medium">
            Hệ thống hỗ trợ y tế chuẩn lâm sàng & phi lâm sàng
          </div>

          {/* Background Decorative Rings */}
          <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-white/30 rounded-full blur-2xl pointer-events-none"></div>
          <div className="absolute -top-16 -right-16 w-56 h-56 bg-sky-300/30 rounded-full blur-2xl pointer-events-none"></div>
        </div>

        {/* CỘT PHẢI: Form Xác thực */}
        <div className="md:col-span-7 p-6 md:p-10 flex flex-col justify-center">
          {errorMessage && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isLogin ? (
            /* ================= FORM ĐĂNG NHẬP ================= */
            <div>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-[#1565C0] tracking-wide uppercase">
                  Đăng Nhập
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Vui lòng tiếp tục đăng nhập để sử dụng hệ thống
                </p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <div className="relative flex items-center">
                    <UserIcon className="absolute left-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Tên đăng nhập/Email"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Mật khẩu"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                    <span>Ghi nhớ đăng nhập</span>
                  </label>
                  <a href="#forgot" className="text-blue-600 hover:underline">
                    Quên mật khẩu?
                  </a>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-[#42A5F5] hover:bg-[#1E88E5] text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-400/30 transition duration-150 disabled:opacity-50"
                >
                  {loading ? 'Đang xác thực...' : 'Đăng nhập'}
                </button>
              </form>

              <div className="text-center mt-6 text-xs text-slate-500">
                Bạn chưa có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setErrorMessage(null); }}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Đăng kí
                </button>
              </div>
            </div>
          ) : (
            /* ================= FORM ĐĂNG KÝ ================= */
            <div>
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-[#1565C0] tracking-wide uppercase">
                  Đăng Ký Tài Khoản
                </h2>
              </div>

              {/* Tabs chọn Role */}
              <div className="flex rounded-xl bg-slate-100 p-1 mb-4">
                <button
                  type="button"
                  onClick={() => setRoleTab('user')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    roleTab === 'user' ? 'bg-[#5C93D8] text-white shadow' : 'text-slate-600'
                  }`}
                >
                  Người dùng phổ thông
                </button>
                <button
                  type="button"
                  onClick={() => setRoleTab('doctor')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                    roleTab === 'doctor' ? 'bg-[#5C93D8] text-white shadow' : 'text-slate-600'
                  }`}
                >
                  Cán bộ y tế
                </button>
              </div>

              <p className="text-[11px] text-slate-500 text-center mb-3">
                Vui lòng nhập đầy đủ thông tin để tạo tài khoản mới
              </p>

              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Họ và tên"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>

                <div className="relative flex items-center">
                  <Phone className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    placeholder="Số điện thoại"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>

                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>

                <div className="grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-7 relative flex items-center">
                    <Calendar className="absolute left-3.5 w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      required
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                      className="w-full pl-10 pr-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition text-slate-600"
                    />
                  </div>
                  <div className="col-span-5 flex items-center justify-around text-xs text-slate-600">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === 'Nam'}
                        onChange={() => setGender('Nam')}
                        className="text-blue-500 focus:ring-blue-400"
                      />
                      <span>Nam</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === 'Nữ'}
                        onChange={() => setGender('Nữ')}
                        className="text-blue-500 focus:ring-blue-400"
                      />
                      <span>Nữ</span>
                    </label>
                  </div>
                </div>

                <div className="relative flex items-center">
                  <MapPin className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Địa chỉ"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                </div>

                {/* Các trường bổ sung cho Cán bộ y tế */}
                {roleTab === 'doctor' && (
                  <div className="grid grid-cols-2 gap-2 animate-fadeIn">
                    <div className="relative flex items-center">
                      <Building2 className="absolute left-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Đơn vị công tác"
                        value={workplace}
                        onChange={(e) => setWorkplace(e.target.value)}
                        className="w-full pl-10 pr-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                      />
                    </div>
                    <div className="relative flex items-center">
                      <BadgeCheck className="absolute left-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Mã số cán bộ y tế"
                        value={staffCode}
                        onChange={(e) => setStaffCode(e.target.value)}
                        className="w-full pl-10 pr-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                      />
                    </div>
                  </div>
                )}

                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Mật khẩu"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Xác nhận mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2.5 px-4 bg-[#5C93D8] hover:bg-[#4178BD] text-white font-semibold text-sm rounded-xl shadow-md transition duration-150 disabled:opacity-50"
                >
                  {loading ? 'Đang khởi tạo...' : 'Đăng kí'}
                </button>
              </form>

              <div className="text-center mt-4 text-xs text-slate-500">
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setErrorMessage(null); }}
                  className="text-blue-600 font-semibold hover:underline"
                >
                  Đăng nhập
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};