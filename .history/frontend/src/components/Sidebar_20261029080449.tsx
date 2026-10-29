import { AlertTriangle, Lightbulb } from "lucide-react";
import ShapCharts from "./ShapCharts";
import { formatDateTime } from "../utils/validators";
import type { PredictionResult, RiskLevel } from "../types";

export const RISK_META: Record<RiskLevel, { label: string; badge: string; bar: string }> = {
  low: { label: "Thấp", badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  medium: { label: "Trung bình", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  high: { label: "Cao", badge: "bg-red-100 text-red-700", bar: "bg-red-500" },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const m = RISK_META[level];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${m.badge}`}>{m.label}</span>;
}

/** Hiển thị kết quả do backend trả về. Mức nguy cơ (Thấp/Trung bình/Cao) do backend phân loại; frontend không tự đặt ngưỡng. */
export default function PredictionResultCard({ result }: { result: PredictionResult }) {
  const m = RISK_META[result.riskLevel];
  const pct = Math.round(result.probability * 1000) / 10;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs text-slate-500">Mức nguy cơ</p>
          <p className="mt-1"><RiskBadge level={result.riskLevel} /></p>
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="flex items-end justify-between">
            <p className="text-xs text-slate-500">Xác suất nguy cơ</p>
            <p className="text-2xl font-extrabold text-slate-800">{pct}%</p>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${m.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Yếu tố ảnh hưởng chính (SHAP)</h3>
        <ShapCharts data={result.shap} />
      </div>

      {result.advice && result.advice.length > 0 && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Lightbulb className="h-4 w-4" aria-hidden /> Lời khuyên</h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-700">
            {result.advice.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>DiaRisk VN chỉ cung cấp thông tin tham khảo, không thay thế chẩn đoán và chỉ định chính thức của bác sĩ chuyên môn.</span>
      </p>

      <p className="text-[11px] text-slate-400">
        {formatDateTime(result.createdAt)}
        {result.modelVersion ? ` · Mô hình ${result.modelVersion}` : ""}
        {result.patientName ? ` · Bệnh nhân: ${result.patientName}` : ""}
      </p>
    </div>
  );
}
