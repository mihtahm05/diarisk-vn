import { ClipboardList, FileDown, FileSpreadsheet, History, KeyRound, Stethoscope, UserRound, Users } from "lucide-react";
import DashboardLayout, { type NavSection } from "../../components/DashboardLayout";

const DOCTOR_NAV: NavSection[] = [
  {
    title: "Hồ sơ cá nhân",
    items: [
      { to: "/doctor/profile", label: "Thông tin cá nhân", icon: UserRound },
      { to: "/doctor/password", label: "Đổi mật khẩu", icon: KeyRound },
      { to: "/doctor/self", label: "Tự đánh giá nguy cơ", icon: Stethoscope },
      { to: "/doctor/history", label: "Lịch sử cá nhân", icon: History },
    ],
  },
  {
    title: "Bệnh nhân",
    items: [
      { to: "/doctor/predict", label: "Dự đoán phi lâm sàng", icon: Stethoscope },
      { to: "/doctor/predict-clinical", label: "Dự đoán lâm sàng", icon: ClipboardList },
      { to: "/doctor/batch", label: "Dự đoán hàng loạt", icon: FileSpreadsheet },
      { to: "/doctor/patients", label: "Tra cứu bệnh nhân", icon: Users },
      { to: "/doctor/reports", label: "Xuất báo cáo", icon: FileDown },
    ],
  },
];

export default function DoctorDashboard() {
  return <DashboardLayout sections={DOCTOR_NAV} />;
}
