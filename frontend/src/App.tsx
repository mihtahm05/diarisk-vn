import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { OwnHistoryPage, ProfilePage } from "./components/AccountPages";
import { useAuth } from "./context/AuthContext";
import { ROLE_HOME } from "./services/authService";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import UserDashboard from "./pages/user/HistoryPage";
import HealthPredict from "./pages/user/PredictionPage";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import PatientPredictLayout from "./pages/doctor/PatientPredictLayout";
import PatientList from "./pages/doctor/PatientList";
import ReportExport from "./pages/doctor/ReportExport";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AccountManagement from "./pages/admin/AccountManagement";
import TemplateManagement from "./pages/admin/TemplateManagement";
import ActivityLogs from "./pages/admin/ActivityLogs";

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? ROLE_HOME[user.role] : "/login"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Người dùng phổ thông */}
      <Route element={<ProtectedRoute roles={["user"]} />}>
        <Route path="/user" element={<UserDashboard />}>
          <Route index element={<Navigate to="predict" replace />} />
          <Route path="predict" element={<HealthPredict mode="nonclinical" target="self" />} />
          <Route path="history" element={<OwnHistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="password" element={<Navigate to="../profile" replace />} />
        </Route>
      </Route>

      {/* Cán bộ y tế */}
      <Route element={<ProtectedRoute roles={["doctor"]} />}>
        <Route path="/doctor" element={<DoctorDashboard />}>
          <Route index element={<Navigate to="predict" replace />} />
          <Route path="predict" element={<PatientPredictLayout />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="reports" element={<ReportExport />} />
          <Route path="self" element={<HealthPredict key="self" mode="nonclinical" target="self" />} />
          <Route path="history" element={<OwnHistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="password" element={<Navigate to="../profile" replace />} />
        </Route>
      </Route>

      {/* Quản trị viên */}
      <Route element={<ProtectedRoute roles={["admin"]} />}>
        <Route path="/admin" element={<AdminDashboard />}>
          <Route index element={<Navigate to="accounts" replace />} />
          <Route path="accounts" element={<AccountManagement />} />
          <Route path="templates" element={<TemplateManagement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="password" element={<Navigate to="../profile" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}