import { LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo, { BrandName } from "./Logo";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export default function DashboardLayout({ sections }: { sections: NavSection[] }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function logout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className="border-b border-slate-200 bg-white p-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2">
          <Logo size={38} />
          <BrandName className="text-lg" />
        </div>
        <div className="mt-5 rounded-lg bg-slate-50 p-3">
          <p className="truncate text-sm font-semibold text-slate-800">{user?.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{user?.role === "admin" ? "Quản trị viên" : user?.role === "doctor" ? "Cán bộ y tế" : "Người dùng"}</p>
        </div>
        <nav className="mt-5 space-y-4">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{section.title}</h2>
              <div className="grid gap-1">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className={({ isActive }) =>
                    `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isActive ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"}`
                  }>
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <button type="button" className="btn-ghost mt-5 w-full" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
