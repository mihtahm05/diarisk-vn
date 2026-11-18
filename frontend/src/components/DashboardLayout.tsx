import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
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

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export default function DashboardLayout({ sections }: { sections: NavSection[] }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dg-app">
      <aside className="dg-sidebar">
        <div className="dg-usercard">
          <span className="dg-avatar" aria-hidden="true">{initials(user?.name)}</span>
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
                  <NavLink key={to} to={to} className={({ isActive }) => `dg-nav-item${isActive ? " is-active" : ""}`}>
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
        <Outlet />
      </main>
    </div>
  );
}
