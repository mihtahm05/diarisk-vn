import { AlertTriangle, Bot, Download, RotateCcw } from "lucide-react";
import { FEATURE_LABELS } from "../config/features";
import type { PredictionMode, PredictionResult } from "../types";
import { RiskBadge } from "./Sidebar";

const riskLabels = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
} as const;

const riskColors = {
  low: "#059669",
  medium: "#d97706",
  high: "#dc2626",
} as const;

const modelDisclaimer = "Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không phải chẩn đoán thay thế cho bác sĩ.";

export function PredictionLoadingView({ mode }: { mode: PredictionMode }) {
  const modeLabel = mode === "clinical" ? "lâm sàng" : "phi lâm sàng";

  return (
    <section className="dg-state-shell" aria-labelledby="prediction-loading-title">
      <div className="dg-state-panel dg-loading-panel">
        <div className="dg-notice dg-state-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>Lưu ý:</strong> DiaRisk VN cung cấp thông tin tham khảo, không thay thế chẩn đoán hoặc chỉ định chính thức của bác sĩ chuyên môn.
          </span>
        </div>

        <div className="dg-loading-content">
          <div className="dg-analysis-orbit" aria-hidden="true">
            <span className="dg-analysis-orbit__ring dg-analysis-orbit__ring--outer" />
            <span className="dg-analysis-orbit__ring dg-analysis-orbit__ring--inner" />
            <span className="dg-analysis-orbit__dot dg-analysis-orbit__dot--one" />
            <span className="dg-analysis-orbit__dot dg-analysis-orbit__dot--two" />
            <span className="dg-analysis-orbit__robot"><Bot /></span>
          </div>
          <h2 id="prediction-loading-title">Mô hình đang phân tích dữ liệu...</h2>
          <p>Đang xử lý thông tin khảo sát ở chế độ {modeLabel}. Vui lòng chờ trong giây lát.</p>
          <div className="dg-progress-track" role="progressbar" aria-label="Đang xử lý yêu cầu dự đoán">
            <span />
          </div>
          <p className="dg-loading-caption">Kết quả sẽ xuất hiện sau khi hệ thống hoàn tất xử lý.</p>
        </div>
      </div>
    </section>
  );
}

export function PredictionResultView({
  result,
  onReset,
  onDownload,
  downloadBusy = false,
  downloadError,
  showActions = true,
  eyebrow,
}: {
  result: PredictionResult;
  onReset?: () => void;
  onDownload?: () => void;
  downloadBusy?: boolean;
  downloadError?: string;
  showActions?: boolean;
  eyebrow?: string;
}) {
  const probability = Math.min(100, Math.max(0, result.probability * 100));
  const factors = [...result.shap]
    .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
    .slice(0, 5);
  const maxContribution = Math.max(...factors.map((factor) => Math.abs(factor.shap)), 0) || 1;
  const classificationLabel = result.classification === "positive"
    ? "Bằng hoặc trên ngưỡng"
    : result.classification === "negative"
      ? "Dưới ngưỡng"
      : "Chưa có phân loại";
  const modeLabel = result.mode === "clinical" ? "Lâm sàng" : "Phi lâm sàng";
  const additionalWarning = result.warning?.trim() === modelDisclaimer
    ? undefined
    : result.warning?.trim();

  return (
    <section className="dg-state-shell" aria-labelledby="prediction-result-title">
      <div className="dg-state-panel dg-result-panel">
        <div className="dg-result-heading">
          <div>
            <p className="dg-result-eyebrow">{eyebrow ?? `Báo cáo sàng lọc cá nhân · ${modeLabel}`}</p>
            <h2 id="prediction-result-title">Kết quả phân tích nguy cơ đái tháo đường</h2>
            {result.patientName && <p className="dg-result-patient">Hồ sơ: {result.patientName}</p>}
          </div>
          {showActions && (
            <div className="dg-result-actions">
              <button type="button" className="dg-btn-secondary" onClick={() => onDownload?.()} disabled={downloadBusy}>
                {downloadBusy ? <span className="dg-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
                Tải PDF
              </button>
              <button type="button" className="dg-btn-secondary dg-result-reset" onClick={() => onReset?.()}>
                <RotateCcw aria-hidden="true" /> Dự đoán lại
              </button>
            </div>
          )}
        </div>
        {showActions && downloadError && <div className="dg-notice dg-notice--error" role="alert">{downloadError}</div>}

        <div className="dg-notice dg-state-notice" role="note">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>Lưu ý:</strong> {modelDisclaimer}
            {additionalWarning && <span className="dg-result-warning-detail"> {additionalWarning}</span>}
          </span>
        </div>

        <div className="dg-result-grid">
          <section className={`dg-risk-card dg-risk-card--${result.riskLevel}`} aria-label="Kết quả sàng lọc">
            <p className="dg-risk-card-label">Xác suất mô hình ước tính</p>
            <div
              className="dg-risk-ring"
              role="img"
              aria-label={`Xác suất mô hình ước tính ${probability.toFixed(1)} phần trăm`}
              style={{
                background: `conic-gradient(${riskColors[result.riskLevel]} ${probability}%, #e9eef5 ${probability}% 100%)`,
              }}
            >
              <div className="dg-risk-ring-center">
                <strong>{probability.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong>
                <span>xác suất</span>
              </div>
            </div>
            <RiskBadge level={result.riskLevel} />
            <p className="dg-risk-level">Mức nguy cơ {riskLabels[result.riskLevel].toLowerCase()}</p>
            <dl className="dg-risk-meta">
              <div>
                <dt>Ngưỡng mô hình</dt>
                <dd>{result.threshold === undefined ? "—" : `${(result.threshold * 100).toFixed(2)}%`}</dd>
              </div>
              <div>
                <dt>So với ngưỡng</dt>
                <dd>{classificationLabel}</dd>
              </div>
            </dl>
          </section>

          <section className="dg-factor-card" aria-labelledby="prediction-factors-title">
            <h3 id="prediction-factors-title">Các yếu tố ảnh hưởng chính</h3>
            <p className="dg-factor-caption">
              Đóng góp SHAP của từng chỉ số vào điểm mô hình; thanh thể hiện độ lớn tương đối, không phải phần trăm xác suất.
            </p>
            {factors.length ? (
              <ul className="dg-factor-list">
                {factors.map((factor) => {
                  const increasing = factor.shap >= 0;
                  const label = factor.label ?? FEATURE_LABELS[factor.feature] ?? factor.feature;
                  const width = (Math.abs(factor.shap) / maxContribution) * 100;
                  return (
                    <li key={factor.feature} className="dg-factor">
                      <div className="dg-factor-topline">
                        <span className="dg-factor-name" title={label}>{label}</span>
                        <span className={`dg-factor-value ${increasing ? "is-increasing" : "is-decreasing"}`}>
                          {factor.shap > 0 ? "+" : ""}{factor.shap.toFixed(3)}
                        </span>
                      </div>
                      <div className="dg-factor-track" aria-hidden="true">
                        <span
                          className={increasing ? "is-increasing" : "is-decreasing"}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <p className="dg-factor-direction">
                        {factor.value !== undefined && <span>Giá trị: {String(factor.value)} · </span>}
                        {increasing ? "Tăng điểm mô hình" : "Giảm điểm mô hình"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="dg-factor-empty">Không có dữ liệu giải thích SHAP cho kết quả này.</p>
            )}
          </section>
        </div>

        {(Boolean(result.advice?.length) || Boolean(result.inputs) || Boolean(result.modelVersion)) && (
          <div className="dg-result-extras">
            {result.advice?.length ? (
              <section className="dg-result-advice">
                <h3>Thông tin tham khảo</h3>
                <ul>
                  {result.advice.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
              </section>
            ) : null}
            {result.inputs && (
              <details className="dg-result-inputs">
                <summary>Xem các chỉ số đầu vào</summary>
                <dl>
                  {Object.entries(result.inputs).map(([name, value]) => (
                    <div key={name}>
                      <dt>{FEATURE_LABELS[name] ?? name}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {result.modelVersion && <p className="dg-model-version">Phiên bản mô hình: {result.modelVersion}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
