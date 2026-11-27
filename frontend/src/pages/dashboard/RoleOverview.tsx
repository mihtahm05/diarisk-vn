import { useEffect, useState } from "react";
import { Activity, ClipboardCheck, FileSpreadsheet, Users, ShieldCheck, ScrollText, ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Header from "../../components/Header";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { DashboardMetrics, RiskLevel } from "../../types";
import "../../dashboard.css";

const riskLabels: Record<RiskLevel, string> = { low: "Thấp", medium: "Trung bình", high: "Cao" };
const riskLevels = [
  { key: "low", label: riskLabels.low, color: "#059669" },
  { key: "medium", label: riskLabels.medium, color: "#d97706" },
  { key: "high", label: riskLabels.high, color: "#dc2626" },
] as const;
const weekdayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getWeekdayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return weekdayLabels[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export default function RoleOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMetrics(null);
    mlService.dashboardMetrics().then((result) => {
      if (active) setMetrics(result);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof ApiError ? cause.message : "Không tải được số liệu tổng quan.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [user?.role, user?.userId]);

  const title = user?.role === "admin" ? "Tổng quan hệ thống" : user?.role === "doctor" ? "Tổng quan hoạt động" : "Tổng quan sức khỏe";
  const subtitle = user?.role === "admin"
    ? "Số liệu tài khoản, biểu mẫu và hoạt động lấy trực tiếp từ hệ thống"
    : user?.role === "doctor"
      ? "Tình trạng bệnh nhân và lịch sử đánh giá từ dữ liệu hiện có"
      : "Lịch sử đánh giá và thông tin cá nhân của tài khoản";

  const cards = metrics?.role === "admin" ? [
    { icon: Users, label: "Tổng tài khoản", value: metrics.stats.totalAccounts, tone: "blue" },
    { icon: ShieldCheck, label: "Vai trò cán bộ y tế", value: metrics.roles.doctor, tone: "teal" },
    { icon: FileSpreadsheet, label: "Biểu mẫu Excel", value: metrics.stats.templates, tone: "amber" },
    { icon: ScrollText, label: "Hoạt động hệ thống", value: metrics.stats.totalLogs, tone: "slate" },
  ] : metrics?.role === "doctor" ? [
    { icon: Users, label: "Bệnh nhân", value: metrics.stats.patients, tone: "blue" },
    { icon: ClipboardCheck, label: "Bệnh nhân có đánh giá", value: metrics.stats.reviewedPatients, tone: "teal" },
    { icon: Activity, label: "Hồ sơ cần xem lại", value: metrics.stats.highRiskPatients, tone: "red" },
  ] : metrics?.role === "user" ? [
    { icon: ClipboardCheck, label: "Tổng lần đánh giá", value: metrics.stats.total, tone: "blue" },
    { icon: Activity, label: "Lần đánh giá gần nhất", value: metrics.stats.latestRisk ? `Nguy cơ ${riskLabels[metrics.stats.latestRisk].toLowerCase()}` : "Chưa có", tone: "teal" },
  ] : [];

  const distribution = metrics && metrics.role !== "admin"
    ? metrics.distribution
    : null;
  const totalRisk = distribution ? distribution.low + distribution.medium + distribution.high : 0;
  const adminRoleSegments = metrics?.role === "admin" ? [
    { key: "user", label: "Người dùng", count: metrics.roles.user, color: "#2563eb" },
    { key: "doctor", label: "Cán bộ y tế", count: metrics.roles.doctor, color: "#0f766e" },
    { key: "admin", label: "Quản trị viên", count: metrics.roles.admin, color: "#94a3b8" },
  ] : [];
  const adminTotalAccounts = metrics?.role === "admin" ? metrics.stats.totalAccounts : 0;
  let accountOffset = 0;
  const adminDonutStops = adminTotalAccounts > 0
    ? adminRoleSegments.map(({ count, color }) => {
      const start = accountOffset;
      accountOffset += (count / adminTotalAccounts) * 360;
      return `${color} ${start}deg ${accountOffset}deg`;
    }).join(", ")
    : "";
  const maxTrendCount = metrics?.role === "doctor"
    ? Math.max(...metrics.trend.flatMap((day) => riskLevels.map(({ key }) => day[key])))
    : 0;

  return (
    <div>
      <Header title={title} subtitle={subtitle} />
      {error && <div className="dg-notice dg-notice--error" role="alert">{error}</div>}
      <section className="dr-overview-grid" aria-label="Chỉ số tổng quan">
        {loading && !metrics ? <div className="dr-overview-loading" role="status">Đang tải số liệu...</div> : cards.map(({ icon: Icon, label, value, tone }) => (
          <article className="dr-stat-card" key={label}>
            <span className={`dr-stat-icon dr-stat-icon--${tone}`}><Icon aria-hidden="true" /></span>
            <div><p>{label}</p><strong>{value.toLocaleString("vi-VN")}</strong></div>
          </article>
        ))}
      </section>
      <div className="dr-overview-layout">
        <section className="dr-overview-panel dr-overview-chart">
          <div className="dr-panel-heading"><div><span>{metrics?.role === "admin" ? "PHÂN BỐ TÀI KHOẢN" : "PHÂN BỐ KẾT QUẢ"}</span><h2>{metrics?.role === "admin" ? "Vai trò trong hệ thống" : metrics?.role === "doctor" ? "Mức nguy cơ theo ngày" : "Mức nguy cơ gần đây"}</h2></div></div>
          {metrics?.role === "admin" ? (
            metrics.stats.totalAccounts > 0 ? (
              <div className="dr-role-donut-layout">
                <div
                  className="dr-role-donut"
                  role="img"
                  aria-label={`Phân bố ${metrics.stats.totalAccounts} tài khoản theo vai trò`}
                  style={{ background: `conic-gradient(${adminDonutStops})` }}
                >
                  <div className="dr-role-donut-center">
                    <span>Tổng tài khoản</span>
                    <strong>{metrics.stats.totalAccounts.toLocaleString("vi-VN")}</strong>
                  </div>
                </div>
                <div className="dr-role-legend">
                  {adminRoleSegments.map(({ key, label, count, color }) => (
                    <div key={key}>
                      <i style={{ background: color }} />
                      <span>{label}</span>
                      <strong>{count.toLocaleString("vi-VN")}</strong>
                      <small>{((count / metrics.stats.totalAccounts) * 100).toFixed(1)}%</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dr-chart-empty"><Users aria-hidden="true" /><p>Chưa có tài khoản để vẽ biểu đồ.</p></div>
            )
          ) : metrics?.role === "doctor" ? (
            maxTrendCount > 0 ? (
              <div className="dr-risk-weekly-layout">
                <div className="dr-risk-weekly-legend" aria-label="Chú giải mức nguy cơ">
                  {riskLevels.map(({ key, label, color }) => (
                    <span key={key}><i style={{ background: color }} />{label}</span>
                  ))}
                </div>
                <div className="dr-risk-weekly">
                  {metrics.trend.map((day) => (
                    <div
                      className="dr-risk-day"
                      key={day.date}
                      role="group"
                      aria-label={`${day.date}: thấp ${day.low}, trung bình ${day.medium}, cao ${day.high}`}
                    >
                      <div className="dr-risk-day-bars">
                        {riskLevels.map(({ key, label, color }) => (
                          <i
                            key={key}
                            title={`${label}: ${day[key]}`}
                            style={{ height: `${(day[key] / maxTrendCount) * 100}%`, background: color }}
                          />
                        ))}
                      </div>
                      <span title={day.date}>{getWeekdayLabel(day.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dr-chart-empty"><Activity aria-hidden="true" /><p>Chưa có đánh giá trong 7 ngày gần nhất.</p></div>
            )
          ) : totalRisk > 0 && distribution ? (
            <div className="dr-risk-bars" aria-label="Phân bố mức nguy cơ">
              {riskLevels.map(({ key, color }) => (
                <div className="dr-risk-bar" key={key}>
                  <span>{riskLabels[key]}</span>
                  <b style={{ width: `${(distribution[key] / totalRisk) * 100}%`, background: color }} />
                  <strong>{distribution[key]}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="dr-chart-empty"><Activity aria-hidden="true" /><p>{loading ? "Đang tải dữ liệu..." : "Chưa có kết quả để vẽ biểu đồ."}</p></div>
          )}
        </section>

        <section className="dr-overview-panel dr-recent-panel">
          <div className="dr-panel-heading"><div><span>DỮ LIỆU GẦN ĐÂY</span><h2>{metrics?.role === "admin" ? "Hoạt động hệ thống" : metrics?.role === "doctor" ? "Bệnh nhân gần đây" : "Hoạt động gần đây"}</h2></div></div>
          <div className="dr-simple-list">
            {loading ? <p>Đang tải dữ liệu...</p> : !metrics?.recent.length ? <p>Chưa có dữ liệu gần đây.</p>
              : metrics.role === "admin" ? metrics.recent.map((item) => (
                <div key={item.logId}><b>{item.userName || item.actionType}</b><span>{item.description || item.actionType}</span></div>
              )) : metrics.role === "doctor" ? metrics.recent.map((item) => (
                <div key={item.patientId}><b>{item.fullName}</b><span>{item.patientCode} · Mức gần nhất: {riskLabels[item.lastRiskLevel]}</span></div>
              )) : metrics.recent.map((item) => (
                <div key={item.predictionId}><b>{item.mode === "clinical" ? "Chế độ lâm sàng" : "Chế độ phi lâm sàng"}</b><span>{new Date(item.createdAt).toLocaleDateString("vi-VN")} · Nguy cơ {riskLabels[item.riskLevel].toLowerCase()}</span></div>
              ))}
          </div>
        </section>
      </div>

      <section className="dr-quick-actions" aria-label="Thao tác nhanh">
        {user?.role === "doctor" ? (
          <>
            <button type="button" onClick={() => navigate("/doctor/predict")}><span><Plus aria-hidden="true" /></span><div><b>Dự đoán bệnh nhân</b><small>Phi lâm sàng, lâm sàng hoặc hàng loạt</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/doctor/patients")}><span><Users aria-hidden="true" /></span><div><b>Quản lý bệnh nhân</b><small>Xem lịch sử đánh giá</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/doctor/reports")}><span><FileSpreadsheet aria-hidden="true" /></span><div><b>Xuất báo cáo</b><small>Excel hoặc PDF</small></div><ArrowRight aria-hidden="true" /></button>
          </>
        ) : user?.role === "admin" ? (
          <>
            <button type="button" onClick={() => navigate("/admin/accounts")}><span><Users aria-hidden="true" /></span><div><b>Tài khoản & phân quyền</b><small>Quản lý vai trò và trạng thái</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/admin/templates")}><span><FileSpreadsheet aria-hidden="true" /></span><div><b>Biểu mẫu Excel</b><small>Quản lý tệp mẫu</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/admin/logs")}><span><ScrollText aria-hidden="true" /></span><div><b>Nhật ký hệ thống</b><small>Xem hoạt động quan trọng</small></div><ArrowRight aria-hidden="true" /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => navigate("/user/predict")}><span><Plus aria-hidden="true" /></span><div><b>Đánh giá mới</b><small>Bắt đầu dự đoán cá nhân</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/user/history")}><span><Activity aria-hidden="true" /></span><div><b>Lịch sử đánh giá</b><small>Xem các lần đánh giá trước</small></div><ArrowRight aria-hidden="true" /></button>
            <button type="button" onClick={() => navigate("/user/profile")}><span><ShieldCheck aria-hidden="true" /></span><div><b>Hồ sơ cá nhân</b><small>Cập nhật thông tin và bảo mật</small></div><ArrowRight aria-hidden="true" /></button>
          </>
        )}
      </section>
    </div>
  );
}
