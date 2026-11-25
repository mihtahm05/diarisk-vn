import { Menu, X, LogOut } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import UserAvatar from "./UserAvatar";
import "../dashboard.css";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  doctor: "Cán bộ y tế",
  user: "Người dùng phổ thông",
};

export default function DashboardLayout({ sections }: { sections: NavSection[] }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dg-app">
      <button type="button" className="dg-mobile-menu" aria-label="Mở điều hướng" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}>
        <Menu aria-hidden="true" />
      </button>
      {mobileNavOpen && <button type="button" className="dg-sidebar-backdrop" aria-label="Đóng điều hướng" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`dg-sidebar${mobileNavOpen ? " is-open" : ""}`}>
        <button type="button" className="dg-sidebar-close" aria-label="Đóng điều hướng" onClick={() => setMobileNavOpen(false)}>
          <X aria-hidden="true" />
        </button>
        <div className="dg-usercard">
          <UserAvatar name={user?.name} src={user?.avatar} className="dg-avatar" />
          <div className="min-w-0">
            <p className="dg-username" title={user?.name}>{user?.name}</p>
            <p className="dg-role">{ROLE_LABELS[user?.role ?? "user"] ?? "Người dùng"}</p>
          </div>
        </div>

        <nav className="dg-nav" aria-label="Điều hướng chính">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="dg-nav-title">{section.title}</h2>
              <div className="dg-nav-list">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end onClick={() => setMobileNavOpen(false)} className={({ isActive }) => `dg-nav-item${isActive ? " is-active" : ""}`}>
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <button type="button" className="dg-nav-item dg-logout" onClick={() => void logout()}>
          <LogOut aria-hidden="true" />
          <span>Đăng xuất</span>
        </button>
      </aside>

      <main className="dg-main">
        <div key={location.pathname} className="dg-page-transition">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
