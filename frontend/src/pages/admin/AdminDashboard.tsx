import { FileSpreadsheet, ScrollText, UserRound, Users } from "lucide-react";
import DashboardLayout, { type NavSection } from "../../components/DashboardLayout";

export const ADMIN_NAV: NavSection[] = [
  {
    title: "Hồ sơ cá nhân",
    items: [
      { to: "/admin/profile", label: "Thông tin cá nhân", icon: UserRound },
    ],
  },
  {
    title: "Quản trị hệ thống",
    items: [
      { to: "/admin/accounts", label: "Tài khoản & phân quyền", icon: Users },
      { to: "/admin/templates", label: "Quản lý tệp mẫu", icon: FileSpreadsheet },
      { to: "/admin/logs", label: "Nhật ký hệ thống", icon: ScrollText },
    ],
  },
];

export default function AdminDashboard() {
  return <DashboardLayout sections={ADMIN_NAV} />;
}
