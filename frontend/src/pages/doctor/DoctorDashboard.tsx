import { ClipboardList, FileDown, History, Stethoscope, UserRound, Users } from "lucide-react";
import DashboardLayout, { type NavSection } from "../../components/DashboardLayout";

const DOCTOR_NAV: NavSection[] = [
  {
    title: "Hồ sơ cá nhân",
    items: [
      { to: "/doctor/profile", label: "Thông tin cá nhân", icon: UserRound },
    ],
  },
  {
    title: "Sức khỏe cá nhân",
    items: [
      { to: "/doctor/self", label: "Tự đánh giá nguy cơ", icon: Stethoscope },
      { to: "/doctor/history", label: "Lịch sử cá nhân", icon: History },
    ],
  },
  {
    title: "Quản lý bệnh nhân",
    items: [
      { to: "/doctor/predict", label: "Dự đoán cho bệnh nhân", icon: Users },
      { to: "/doctor/patients", label: "Lịch sử bệnh nhân", icon: ClipboardList },
      { to: "/doctor/reports", label: "Xuất báo cáo", icon: FileDown },
    ],
  },
];

export default function DoctorDashboard() {
  return <DashboardLayout sections={DOCTOR_NAV} />;
}