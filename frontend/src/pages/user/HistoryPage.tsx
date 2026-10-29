import { History, KeyRound, Stethoscope, UserRound } from "lucide-react";
import DashboardLayout, { type NavSection } from "../../components/DashboardLayout";

export const USER_NAV: NavSection[] = [
  {
    title: "Hồ sơ cá nhân",
    items: [
      { to: "/user/profile", label: "Quản lý thông tin cá nhân", icon: UserRound },
      { to: "/user/password", label: "Quản lý mật khẩu", icon: KeyRound },
    ],
  },
  {
    title: "Sức khỏe cá nhân",
    items: [
      { to: "/user/predict", label: "Dự đoán nguy cơ cá nhân", icon: Stethoscope },
      { to: "/user/history", label: "Lịch sử dự đoán cá nhân", icon: History },
    ],
  },
];

/** Khung dashboard của người dùng phổ thông; nội dung hiển thị qua <Outlet /> theo route con. */
export default function UserDashboard() {
  return <DashboardLayout sections={USER_NAV} />;
}
