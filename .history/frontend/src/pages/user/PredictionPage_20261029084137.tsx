import React, { useState, useMemo } from 'react';
import { 
  User as UserIcon, 
  Activity, 
  History, 
  Settings, 
  LogOut, 
  AlertTriangle, 
  PlusCircle, 
  BarChart3,
  CheckCircle2
} from 'lucide-react';
import { mlService } from '../../services/mlService';
import { NonClinicalFeatures, PredictionResult } from '../../types';

export const PredictionPage: React.FC = () => {
  // Profile state giả định từ Token
  const currentUser = {
    name: 'Nguyen Thi B',
    roleLabel: 'Người dùng phổ thông'
  };

  // Form State: 1. Thông tin cơ bản
  const [age, setAge] = useState<number>(40);
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nữ');
  const [heightCm, setHeightCm] = useState<number>(170);
  const [weightKg, setWeightKg] = useState<number>(68);

  // Form State: Lối sống & Sức khỏe (16 biến Non-clinical)
  const [genHealth, setGenHealth] = useState<number>(3); // 1: Tốt -> 5: Kém
  const [physHlthDays, setPhysHlthDays] = useState<number>(0);
  const [mentHlthDays, setMentHlthDays] = useState<number>(0);
  const [diffWalk, setDiffWalk] = useState<number>(2); // 1: Có, 2: Không
  const [smokerStatus, setSmokerStatus] = useState<number>(4); // 4: Không hút
  const [physicalActivity, setPhysicalActivity] = useState<number>(1); // 1: Có tập
  const [fruitsDaily, setFruitsDaily] = useState<number>(1);
  const [veggiesDaily, setVeggiesDaily] = useState<number>(1);
  const [heavyAlcohol, setHeavyAlcohol] = useState<number>(1); // 1: Không
  const [education, setEducation] = useState<number>(4);
  const [income, setIncome] = useState<number>(5);
  const [anyHealthcare, setAnyHealthcare] = useState<number>(1);
  const [noDocCost, setNoDocCost] = useState<number>(2);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);

  // Tính BMI tự động
  const bmiCalculation = useMemo(() => {
    if (!heightCm || !weightKg || heightCm <= 0) return { bmi: 0, text: 'Chưa xác định', color: 'text-slate-400' };
    const heightM = heightCm / 100;
    const val = parseFloat((weightKg / (heightM * heightM)).toFixed(2));
    if (val < 18.5) return { bmi: val, text: 'Thiếu cân', color: 'text-amber-500', badgeBg: 'bg-amber-500' };
    if (val < 25) return { bmi: val, text: 'Bình thường', color: 'text-emerald-500', badgeBg: 'bg-[#81C784]' };
    if (val < 30) return { bmi: val, text: 'Thừa cân', color: 'text-orange-500', badgeBg: 'bg-orange-500' };
    return { bmi: val, text: 'Béo phì', color: 'text-rose-600', badgeBg: 'bg-rose-600' };
  }, [heightCm, weightKg]);

  // Quy đổi tuổi sang nhóm BRFSS (_AGEG5YR: 1: 18-24 ... 13: 80+)
  const mapAgeToGroup = (ageVal: number): number => {
    if (ageVal < 25) return 1;
    if (ageVal < 30) return 2;
    if (ageVal < 35) return 3;
    if (ageVal < 40) return 4;
    if (ageVal < 45) return 5;
    if (ageVal < 50) return 6;
    if (ageVal < 55) return 7;
    if (ageVal < 60) return 8;
    if (ageVal < 65) return 9;
    if (ageVal < 70) return 10;
    if (ageVal < 75) return 11;
    if (ageVal < 80) return 12;
    return 13;
  };

  const handlePredict = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const payload: NonClinicalFeatures = {
      age_group: mapAgeToGroup(age),
      sex: gender === 'Nam' ? 1 : 2,
      bmi: bmiCalculation.bmi,
      smoker_status: smokerStatus,
      physical_activity: physicalActivity,
      fruits_daily: fruitsDaily,
      veggies_daily: veggiesDaily,
      heavy_alcohol: heavyAlcohol,
      gen_health: genHealth,
      ment_hlth_days: mentHlthDays,
      phys_hlth_days: physHlthDays,
      diff_walk: diffWalk,
      education,
      income,
      any_healthcare: anyHealthcare,
      no_doc_cost: noDocCost
    };

    try {
      const res = await mlService.predictNonClinical(payload);
      setResult(res);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Có lỗi khi phân tích nguy cơ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F7FF] flex font-sans">
      
      {/* SIDEBAR BÊN TRÁI CHUẨN MOCKUP */}
      <aside className="w-64 bg-[#E3F2FD]/80 p-5 flex flex-col justify-between border-r border-blue-100 hidden md:flex">
        <div>
          {/* Header Sidebar */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-black text-slate-700 tracking-tight">
              DiaRisk <span className="text-[#0288D1]">VN</span>
            </h1>
          </div>

          {/* User Profile Card */}
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-blue-50 flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">{currentUser.name}</div>
              <div className="text-[10px] text-slate-400">Role: {currentUser.roleLabel}</div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-4 text-xs">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Hồ sơ cá nhân</div>
              <ul className="space-y-1">
                <li>
                  <a href="#profile" className="flex items-center gap-2.5 px-3 py-2 text-slate-600 rounded-xl hover:bg-white/60 transition">
                    <UserIcon className="w-4 h-4 text-slate-400" /> Quản lý thông tin cá nhân
                  </a>
                </li>
                <li>
                  <a href="#password" className="flex items-center gap-2.5 px-3 py-2 text-slate-600 rounded-xl hover:bg-white/60 transition">
                    <Settings className="w-4 h-4 text-slate-400" /> Quản lý mật khẩu
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Sức khỏe cá nhân</div>
              <ul className="space-y-1">
                <li>
                  <a href="#predict" className="flex items-center gap-2.5 px-3 py-2 bg-white text-blue-600 font-semibold rounded-xl shadow-sm">
                    <Activity className="w-4 h-4 text-blue-500" /> Dự đoán nguy cơ cá nhân
                  </a>
                </li>
                <li>
                  <a href="#history" className="flex items-center gap-2.5 px-3 py-2 text-slate-600 rounded-xl hover:bg-white/60 transition">
                    <History className="w-4 h-4 text-slate-400" /> Lịch sử dự đoán cá nhân
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-blue-200/60 space-y-1 text-xs">
          <a href="#settings" className="flex items-center gap-2.5 px-3 py-2 text-slate-600 rounded-xl hover:bg-white/60">
            <Settings className="w-4 h-4 text-slate-400" /> Cài đặt
          </a>
          <button 
            onClick={() => window.location.href = '/login'}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 rounded-xl hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* NỘI DUNG CHÍNH */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        
        {/* Title Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              Dự đoán cho bệnh nhân – Chế độ phi lâm sàng
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nhập thông tin bệnh nhân và các chỉ số sức khỏe để phân tích nguy cơ đái tháo đường
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#29B6F6] text-white flex items-center justify-center shadow">
              <Activity className="w-5 h-5" />
            </div>
            <span className="font-bold text-slate-700 text-sm">DiaRisk VN</span>
          </div>
        </div>

        {/* BANNER ROBOT AI & CẢNH BÁO Y TẾ */}
        <div className="relative rounded-3xl overflow-hidden mb-6 shadow-sm border border-blue-100 bg-white">
          <div className="h-48 md:h-56 bg-gradient-to-r from-blue-100 via-sky-50 to-blue-200 flex items-center justify-center relative">
            {/* Robot Mascot SVG / Icon */}
            <div className="w-28 h-28 rounded-full bg-white shadow-xl flex items-center justify-center border-4 border-sky-300 relative z-10 animate-bounce">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-sky-400 to-blue-600 flex flex-col items-center justify-center p-2 text-white">
                <div className="flex gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                </div>
                <div className="w-8 h-1.5 bg-white/80 rounded-full"></div>
              </div>
            </div>
          </div>
          
          {/* Hộp lưu ý quan trọng */}
          <div className="bg-[#4D82EB] text-white text-xs px-6 py-3.5 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0" />
            <span>
              <strong>Lưu ý:</strong> DiaRisk VN chỉ cung cấp thông tin tham khảo, không thay thế chẩn đoán và chỉ định chính thức của bác sĩ chuyên môn.
            </span>
          </div>
        </div>

        {/* BIỂU MẪU NHẬP LIỆU */}
        <form onSubmit={handlePredict} className="space-y-6">
          
          {/* Card 1: Thông tin cơ bản */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center">1</span>
              <h3 className="font-bold text-slate-800 text-sm">Thông tin cơ bản</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tuổi (18-100)</label>
                <input
                  type="number"
                  min="18"
                  max="100"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value) || 18)}
                  className="w-full px-3.5 py-2 text-xs bg-[#EAF2FD] rounded-xl border-none font-semibold text-slate-700 focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-2">Giới tính</label>
                <div className="flex items-center gap-4 text-xs text-slate-600 h-9">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="user-gender"
                      checked={gender === 'Nam'}
                      onChange={() => setGender('Nam')}
                      className="text-blue-500"
                    />
                    <span>Nam</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="user-gender"
                      checked={gender === 'Nữ'}
                      onChange={() => setGender('Nữ')}
                      className="text-blue-500"
                    />
                    <span>Nữ</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chiều cao (Cm)</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(parseFloat(e.target.value) || 0)}
                    className="w-full pl-3.5 pr-8 py-2 text-xs bg-[#EAF2FD] rounded-xl border-none font-semibold text-slate-700 focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 text-[11px] text-slate-400">Cm</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Cân nặng (Kg)</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) => setWeightKg(parseFloat(e.target.value) || 0)}
                    className="w-full pl-3.5 pr-8 py-2 text-xs bg-[#EAF2FD] rounded-xl border-none font-semibold text-slate-700 focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="absolute right-3 text-[11px] text-slate-400">Kg</span>
                </div>
              </div>
            </div>

            {/* Chỉ số BMI tự động */}
            <div className="mt-4 p-3.5 bg-[#E8F8F5] border-2 border-[#A3E4D7] rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PlusCircle className="w-6 h-6 text-[#27AE60]" />
                <div>
                  <div className="text-sm font-bold text-slate-800">
                    Chỉ số BMI tự động: <span className="text-[#27AE60]">{bmiCalculation.bmi} kg/m²</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Cân nặng hợp lý cho chiều cao của bạn</div>
                </div>
              </div>
              <span className={`px-4 py-1.5 text-xs font-bold text-white rounded-xl shadow-sm ${bmiCalculation.badgeBg}`}>
                {bmiCalculation.text}
              </span>
            </div>
          </div>

          {/* Card 2: Lối sống & Thói quen */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center">2</span>
              <h3 className="font-bold text-slate-800 text-sm">Lối sống & Thói quen sinh hoạt</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tình trạng sức khỏe chung</label>
                <select 
                  value={genHealth} 
                  onChange={(e) => setGenHealth(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={1}>1 - Rất tốt / Xuất sắc</option>
                  <option value={2}>2 - Khá tốt</option>
                  <option value={3}>3 - Trung bình</option>
                  <option value={4}>4 - Kém</option>
                  <option value={5}>5 - Rất yếu</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hoạt động thể lực (30 ngày qua)</label>
                <select 
                  value={physicalActivity} 
                  onChange={(e) => setPhysicalActivity(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={1}>Có vận động / thể dục</option>
                  <option value={2}>Không vận động</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hút thuốc lá</label>
                <select 
                  value={smokerStatus} 
                  onChange={(e) => setSmokerStatus(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={4}>Không bao giờ hút</option>
                  <option value={3}>Đã từng hút nhưng đã bỏ</option>
                  <option value={2}>Hút thỉnh thoảng</option>
                  <option value={1}>Hút thuốc hàng ngày</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Khó khăn khi đi bộ / leo cầu thang</label>
                <select 
                  value={diffWalk} 
                  onChange={(e) => setDiffWalk(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={2}>Không có khó khăn</option>
                  <option value={1}>Có khó khăn</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tiêu thụ rượu bia mức độ nặng</label>
                <select 
                  value={heavyAlcohol} 
                  onChange={(e) => setHeavyAlcohol(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={1}>Không</option>
                  <option value={2}>Có</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ăn trái cây & rau củ hàng ngày</label>
                <select 
                  value={fruitsDaily} 
                  onChange={(e) => setFruitsDaily(Number(e.target.value))}
                  className="w-full p-2 bg-[#EAF2FD] rounded-xl text-xs font-medium text-slate-700"
                >
                  <option value={1}>Đầy đủ (≥ 1 lần/ngày)</option>
                  <option value={2}>Ít khi (&lt; 1 lần/ngày)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Nút Thực hiện dự đoán */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3 bg-[#1976D2] hover:bg-[#1565C0] text-white font-bold text-sm rounded-2xl shadow-lg shadow-blue-500/30 transition disabled:opacity-50 flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              {loading ? 'Đang phân tích dữ liệu...' : 'Dự đoán ngay'}
            </button>
          </div>
        </form>

        {/* KẾT QUẢ DỰ ĐOÁN & PHÂN TÍCH SHAP */}
        {result && (
          <div className="mt-8 bg-white rounded-3xl p-6 border border-blue-200 shadow-md animate-fadeIn">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Kết quả đánh giá nguy cơ
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-xs text-slate-400">Mức độ nguy cơ</div>
                <div className={`text-2xl font-black mt-1 ${
                  result.riskLevel === 'Cao' ? 'text-rose-600' :
                  result.riskLevel === 'Trung bình' ? 'text-amber-500' : 'text-emerald-600'
                }`}>
                  {result.riskLevel}
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-xs text-slate-400">Xác suất mắc bệnh</div>
                <div className="text-2xl font-black text-slate-800 mt-1">
                  {(result.probability * 100).toFixed(1)}%
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-xs text-slate-400">Mô hình phân tích</div>
                <div className="text-sm font-bold text-blue-700 mt-2">
                  XGBoost + SHAP ({result.mode})
                </div>
              </div>
            </div>

            {/* Khuyến nghị y tế */}
            <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-100 mb-4">
              <h4 className="text-xs font-bold text-blue-800 mb-2">Lời khuyên sức khỏe:</h4>
              <ul className="text-xs text-slate-700 space-y-1 list-disc pl-5">
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};