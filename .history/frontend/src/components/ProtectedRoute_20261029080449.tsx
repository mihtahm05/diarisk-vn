import { Loader2 } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../services/authService";
import type { Role } from "../types";

/**
 * Chặn truy cập phía giao diện theo role do backend xác nhận (user lấy từ GET /auth/me).
 * Đây chỉ là lớp UX: mọi API vẫn được backend kiểm tra quyền độc lập.
 */
export default function ProtectedRoute({ roles }: { roles: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-brand-600" role="status" aria-label="Đang tải">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.status === "locked") return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <Outlet />;
}
