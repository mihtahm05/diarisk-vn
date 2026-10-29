import { useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import Header from "../../components/Header";
import { Notice } from "../../components/FormControls";
import { RiskBadge } from "../../components/Sidebar";
import { FEATURE_LABELS } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { BatchResultRow, BatchValidation } from "../../types";

const MAX_BYTES = 10 * 1024 * 1024;

/** UC-07: tải file .xlsx → báo cáo kiểm tra → xác nhận dự đoán các dòng hợp lệ → bảng kết quả. Việc kiểm tra và dự đoán do backend thực hiện. */
export default function BatchPredict() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "validate" | "confirm" | "template">("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<BatchValidation | null>(null);
  const [rows, setRows] = useState<BatchResultRow[] | null>(null);

  function reset() {
    setReport(null); setRows(null); setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file?: File) {
    if (!file) return;
    setError(""); setReport(null); setRows(null);
    if (!/\.xlsx$/i.test(file.name)) { setError("Định dạng tệp không hợp lệ. Vui lòng tải lên tệp Excel (.xlsx)"); return; }
    if (file.size > MAX_BYTES) { setError("Tệp quá lớn (tối đa 10 MB)."); return; }
    setBusy("validate");
    try {
      setReport(await mlService.validateBatch(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không đọc được tệp. Vui lòng tải đúng tệp mẫu.");
    } finally { setBusy(""); }
  }

  async function confirm() {
    if (!report || busy) return;
    setBusy("confirm"); setError("");
    try {
      setRows((await mlService.confirmBatch(report.batchId)).rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không thể thực hiện dự đoán, vui lòng thử lại sau");
    } finally { setBusy(""); }
  }

  async function template() {
    setBusy("template"); setError("");
    try { await mlService.downloadTemplate(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không tải được tệp mẫu."); }
    finally { setBusy(""); }
  }

  return (
    <div>
      <Header title="Dự đoán hàng loạt" subtitle="Tải tệp Excel chứa thông tin khảo sát của nhiều bệnh nhân để dự đoán cùng lúc" />
      <div className="space-y-4">
        <Notice tone="info">Model sử dụng dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam; kết quả không phải chẩn đoán.</Notice>
        {error && <Notice tone="error">{error}</Notice>}

        {!rows && (
          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Dùng đúng cấu trúc cột của tệp mẫu do hệ thống cung cấp.</p>
              <button className="btn-ghost" onClick={template} disabled={busy === "template"}>
                {busy === "template" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Tải tệp mẫu (.xlsx)
              </button>
            </div>

            {(!report || report.validRows === 0) && (
              <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-10 text-center text-sm text-brand-700 hover:bg-brand-100">
                {busy === "validate" ? <Loader2 className="h-8 w-8 animate-spin" /> : <Upload className="h-8 w-8" />}
                <span className="font-semibold">{report ? "Tải lại file mới" : "Chọn tệp Excel (.xlsx) để tải lên"}</span>
                <span className="text-xs text-slate-500">Tối đa 10 MB</span>
                <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                  onChange={(e) => onFile(e.target.files?.[0])} disabled={busy !== ""} />
              </label>
            )}
          </section>
        )}

        {report && !rows && (
          <section className="panel">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-slate-800"><FileSpreadsheet className="h-5 w-5 text-brand-600" /> Báo cáo kiểm tra file dữ liệu</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Tên file</dt><dd className="truncate font-medium" title={report.fileName}>{report.fileName}</dd></div>
              <div><dt className="text-xs text-slate-500">Tổng số dòng</dt><dd className="font-medium">{report.totalRows}</dd></div>
              <div><dt className="text-xs text-slate-500">Dòng hợp lệ</dt><dd className="font-medium text-emerald-600">{report.validRows}</dd></div>
              <div><dt className="text-xs text-slate-500">Dòng lỗi</dt><dd className="font-medium text-red-600">{report.errorRows}</dd></div>
            </dl>

            {report.errors.length > 0 && (
              <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[480px]">
                  <thead className="sticky top-0 bg-slate-50"><tr><th className="th">Dòng</th><th className="th">Cột</th><th className="th">Chi tiết lỗi</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.errors.map((er, i) => (<tr key={i}><td className="td">{er.rowNo}</td><td className="td">{er.columnName}</td><td className="td text-red-600">{er.errorMessage}</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {report.validRows > 0 ? (
                <button className="btn-primary" onClick={confirm} disabled={busy !== ""}>
                  {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận dự đoán cho các dòng hợp lệ
                </button>
              ) : (
                <Notice tone="error">Toàn bộ dữ liệu đều lỗi (0 dòng hợp lệ). Vui lòng sửa tệp và tải lại file mới.</Notice>
              )}
              <button className="btn-ghost" onClick={reset} disabled={busy !== ""}><RotateCcw className="h-4 w-4" /> Chọn tệp khác</button>
            </div>
          </section>
        )}

        {rows && (
          <section className="panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-slate-800">Kết quả dự đoán hàng loạt ({rows.length} bệnh nhân)</h2>
              <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Dự đoán đợt mới</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-slate-200"><tr><th className="th">Mã bệnh nhân</th><th className="th">Họ tên</th><th className="th">Mức nguy cơ</th><th className="th">Xác suất</th><th className="th">Yếu tố ảnh hưởng chính</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.predictionId}>
                      <td className="td">{r.patientCode ?? "—"}</td><td className="td">{r.fullName ?? "—"}</td>
                      <td className="td"><RiskBadge level={r.riskLevel} /></td><td className="td">{(r.probability * 100).toFixed(1)}%</td>
                      <td className="td text-xs">{r.topFactors.map((factor) => FEATURE_LABELS[factor] ?? factor).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
