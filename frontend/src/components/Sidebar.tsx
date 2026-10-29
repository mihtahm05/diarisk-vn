import { AlertTriangle } from "lucide-react";
import ShapCharts from "./ShapCharts";
import { FEATURE_LABELS } from "../config/features";
import type { PredictionResult, RiskLevel } from "../types";

const riskLabels: Record<RiskLevel, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

const riskStyles: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskStyles[level]}`}>{riskLabels[level]}</span>;
}

export default function PredictionResultCard({ result }: { result: PredictionResult }) {
  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
        <div>
          <p className="text-xs text-slate-500">Mức nguy cơ</p>
          <div className="mt-1"><RiskBadge level={result.riskLevel} /></div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Xác suất mô hình ước tính</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{(result.probability * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Không sử dụng kết quả để tự chẩn đoán hoặc điều trị.</p>
        {result.warning && <p className="mt-1 text-xs leading-5">{result.warning}</p>}
      </div>

      {result.patientName && <p className="text-sm"><b>Bệnh nhân:</b> {result.patientName}</p>}
      <section>
        <h3 className="mb-2 text-sm font-bold text-slate-800">Yếu tố đóng góp vào điểm mô hình</h3>
        <p className="mb-2 text-xs text-slate-500">Giá trị SHAP thể hiện đóng góp vào điểm mô hình, không phải mức thay đổi xác suất theo phần trăm.</p>
        <ShapCharts data={result.shap} />
      </section>

      {result.inputs && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-slate-800">Chỉ số đầu vào</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(result.inputs).map(([name, value]) => (
              <div key={name} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
                <dt className="text-slate-500">{FEATURE_LABELS[name] ?? name}</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {result.advice?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">
          {result.advice.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
        </ul>
      ) : null}
    </article>
  );
}
