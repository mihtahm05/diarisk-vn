import { FEATURE_LABELS } from "../config/features";
import type { ShapContribution } from "../types";

/**
 * Biểu đồ yếu tố ảnh hưởng (SHAP) dạng thanh phân kỳ.
 * Giá trị SHAP > 0 làm tăng điểm đầu ra của mô hình, < 0 làm giảm điểm đó.
 */
export default function ShapCharts({ data, top = 10 }: { data: ShapContribution[]; top?: number }) {
  const rows = [...data].sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, top);
  if (!rows.length) return <p className="text-sm text-slate-500">Không có dữ liệu giải thích (SHAP).</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.shap))) || 1;

  return (
    <div>
      <ul className="space-y-1.5" aria-label="Các yếu tố ảnh hưởng chính">
        {rows.map((r) => {
          const w = (Math.abs(r.shap) / max) * 50;
          const up = r.shap >= 0;
          return (
            <li key={r.feature} className="grid grid-cols-[minmax(90px,38%)_1fr] items-center gap-2 text-xs sm:grid-cols-[minmax(150px,34%)_1fr]">
              <span className="truncate text-right text-slate-600" title={r.label ?? FEATURE_LABELS[r.feature] ?? r.feature}>
                {r.label ?? FEATURE_LABELS[r.feature] ?? r.feature}
                {r.value !== undefined && <span className="ml-1 text-slate-400">({String(r.value)})</span>}
              </span>
              <span className="relative block h-5 rounded bg-slate-100">
                <span className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
                <span
                  className={`absolute inset-y-0.5 rounded-sm ${up ? "bg-rose-400" : "bg-sky-400"}`}
                  style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
                <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-700 ${up ? "right-1" : "left-1"}`}>
                  {r.shap > 0 ? "+" : ""}
                  {r.shap.toFixed(3)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" /> Tăng điểm mô hình</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-400" /> Giảm điểm mô hình</span>
      </div>
    </div>
  );
}
