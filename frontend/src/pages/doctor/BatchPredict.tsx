import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import Header from "../../components/Header";
import { Notice } from "../../components/FormControls";
import { ConfirmDialog } from "../../components/Modal";
import { DgPagination } from "../../components/HistoryUI";
import { RiskBadge } from "../../components/Sidebar";
import { FEATURE_LABELS } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { BatchDetail, BatchResultRow, BatchSummary, BatchValidation, RiskLevel } from "../../types";

const MAX_BYTES = 10 * 1024 * 1024;
const BATCH_PAGE_SIZE = 5;

const batchStatusLabels: Record<string, string> = {
  validated: "Đã kiểm tra",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  partially_completed: "Hoàn tất một phần",
  failed: "Thất bại",
  invalid: "Dữ liệu không hợp lệ",
};

/** UC-07: tải file .xlsx → báo cáo kiểm tra → xác nhận dự đoán các dòng hợp lệ → bảng kết quả. Việc kiểm tra và dự đoán do backend thực hiện. */
export default function BatchPredict({ hideHeader = false }: { hideHeader?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "validate" | "confirm" | "template" | "download">("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<BatchValidation | null>(null);
  const [rows, setRows] = useState<BatchResultRow[] | null>(null);
  const [executionErrors, setExecutionErrors] = useState<BatchValidation["errors"]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchPage, setBatchPage] = useState(1);
  const [batchLoading, setBatchLoading] = useState(true);
  const [toDeleteBatch, setToDeleteBatch] = useState<BatchSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [archive, setArchive] = useState<BatchDetail | null>(null);
  const [archiveBusy, setArchiveBusy] = useState("");
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadBatches = useCallback(async () => {
    setBatchLoading(true);
    try {
      const result = await mlService.batches({ page: batchPage, pageSize: BATCH_PAGE_SIZE });
      setBatches(result.items);
      setBatchTotal(result.total);
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được lịch sử các phiên dự đoán.");
    } finally {
      setBatchLoading(false);
    }
  }, [batchPage]);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const activeRows = rows ?? archive?.rows ?? null;
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (activeRows ?? []).filter((row) => {
      const matchesText = !needle
        || `${row.patientCode ?? ""} ${row.fullName ?? ""}`.toLocaleLowerCase().includes(needle);
      return matchesText && (!riskFilter || row.riskLevel === riskFilter);
    });
  }, [activeRows, query, riskFilter]);
  const riskCounts = useMemo(() => ({
    low: (activeRows ?? []).filter((row) => row.riskLevel === "low").length,
    medium: (activeRows ?? []).filter((row) => row.riskLevel === "medium").length,
    high: (activeRows ?? []).filter((row) => row.riskLevel === "high").length,
  }), [activeRows]);
  const resultTotal = report?.totalRows ?? archive?.totalRows ?? activeRows?.length ?? 0;
  const resultFailed = archive
    ? archive.failedRows ?? 0
    : (report?.errorRows ?? 0) + executionErrors.length;
  const riskTotal = activeRows?.length ?? 0;
  const donutStyle = riskTotal > 0
    ? { background: `conic-gradient(#16a36a 0 ${riskCounts.low / riskTotal * 100}%, #e8a21b ${riskCounts.low / riskTotal * 100}% ${(riskCounts.low + riskCounts.medium) / riskTotal * 100}%, #dc4c5c ${(riskCounts.low + riskCounts.medium) / riskTotal * 100}% 100%)` }
    : undefined;

  function reset() {
    setReport(null); setRows(null); setExecutionErrors([]); setArchive(null); setError("");
    setQuery(""); setRiskFilter(""); setPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(file?: File) {
    if (!file) return;
    setError(""); setReport(null); setRows(null); setArchive(null); setExecutionErrors([]);
    if (!/\.xlsx$/i.test(file.name)) { setError("Định dạng tệp không hợp lệ. Vui lòng tải lên tệp Excel (.xlsx)"); return; }
    if (file.size > MAX_BYTES) { setError("Tệp quá lớn (tối đa 10 MB)."); return; }
    setBusy("validate");
    try {
      setReport(await mlService.validateBatch(file));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không đọc được tệp. Vui lòng tải đúng tệp mẫu.");
    } finally { setBusy(""); }
  }

  async function confirmPrediction() {
    if (!report || busy) return;
    setBusy("confirm"); setError("");
    try {
      const result = await mlService.confirmBatch(report.batchId);
      setRows(result.rows);
      setExecutionErrors(result.errors);
      await loadBatches();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không thể thực hiện dự đoán, vui lòng thử lại sau");
    } finally { setBusy(""); }
  }

  async function openBatch(batchId: string) {
    setArchiveBusy(batchId); setError(""); setReport(null); setRows(null);
    try {
      setArchive(await mlService.batchDetail(batchId));
      setQuery(""); setRiskFilter(""); setPage(1);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được chi tiết phiên dự đoán.");
    } finally { setArchiveBusy(""); }
  }

  async function downloadResults(batchId: string) {
    setBusy("download"); setError("");
    try {
      await mlService.exportReport({ scope: "batch", format: "xlsx", batchId });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được tệp kết quả.");
    } finally { setBusy(""); }
  }

  async function deleteBatch() {
    if (!toDeleteBatch) return;
    setDeleteBusy(true);
    setError("");
    try {
      await mlService.removeBatch(toDeleteBatch.batchId);
      setToDeleteBatch(null);
      if (batches.length === 1 && batchPage > 1) setBatchPage((current) => current - 1);
      else await loadBatches();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không thể xóa phiên dự đoán.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function template() {
    setBusy("template"); setError("");
    try { await mlService.downloadTemplate(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không tải được tệp mẫu."); }
    finally { setBusy(""); }
  }

  return (
    <div>
      {!hideHeader && <Header title="Dự đoán hàng loạt" subtitle="Tải tệp Excel chứa thông tin khảo sát của nhiều bệnh nhân để dự đoán cùng lúc" />}
      <div className="space-y-4">
        <Notice tone="info">Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không phải chẩn đoán thay thế cho bác sĩ.</Notice>
        {error && <Notice tone="error">{error}</Notice>}

        {!rows && (
          <section className="panel dr-batch-upload">
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
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // cho phép chọn lại đúng tệp đó sau khi báo lỗi
                    void onFile(file);
                  }} disabled={busy !== ""} />
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
                <button className="btn-primary" onClick={confirmPrediction} disabled={busy !== ""}>
                  {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác nhận dự đoán cho các dòng hợp lệ
                </button>
              ) : (
                <Notice tone="error">Toàn bộ dữ liệu đều lỗi (0 dòng hợp lệ). Vui lòng sửa tệp và tải lại file mới.</Notice>
              )}
              <button className="btn-ghost" onClick={reset} disabled={busy !== ""}><RotateCcw className="h-4 w-4" /> Chọn tệp khác</button>
            </div>
          </section>
        )}

        {activeRows && (
          <section className="panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-bold text-slate-800">
                {archive ? `Phiên: ${archive.fileName}` : `Kết quả dự đoán hàng loạt (${activeRows.length} dòng thành công)`}
              </h2>
              <div className="flex flex-wrap gap-2">
                {(archive || report) && <button className="btn-ghost" onClick={() => void downloadResults(archive?.batchId ?? report!.batchId)} disabled={busy !== ""}>
                  {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Tải kết quả (.xlsx)
                </button>}
                <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Dự đoán đợt mới</button>
              </div>
            </div>

            <div className="dr-batch-kpis">
              <article><span>Tổng bản ghi</span><strong>{resultTotal}</strong></article>
              <article><span>Thành công</span><strong className="is-success">{activeRows.length}</strong></article>
              <article><span>Thất bại</span><strong className="is-error">{resultFailed}</strong></article>
            </div>

            <div className="dr-batch-charts">
              <section className="dr-batch-chart-card">
                <h3>Phân bố nguy cơ</h3>
                {riskTotal ? (
                  <div className="dr-batch-donut-layout">
                    <div className="dr-batch-donut" style={donutStyle} role="img"
                      aria-label={`Phân bố nguy cơ trên ${riskTotal} bản ghi thành công`}><span>{riskTotal}<small>thành công</small></span></div>
                    <ul>
                      {(["low", "medium", "high"] as const).map((level) => (
                        <li key={level}><span className={`dr-risk-dot dr-risk-dot--${level}`} />{level === "low" ? "Thấp" : level === "medium" ? "Trung bình" : "Cao"}
                          <b>{riskCounts[level]} <small>({(riskCounts[level] / riskTotal * 100).toFixed(1)}%)</small></b></li>
                      ))}
                    </ul>
                  </div>
                ) : <p className="dr-batch-chart-empty">Chưa có bản ghi dự đoán thành công để thống kê.</p>}
              </section>
              <section className="dr-batch-chart-card">
                <h3>Số lượng theo mức nguy cơ</h3>
                <div className="dr-batch-bars" role="img" aria-label="Biểu đồ số lượng bản ghi theo mức nguy cơ">
                  {(["low", "medium", "high"] as const).map((level) => (
                    <div className="dr-batch-bar-row" key={level}>
                      <span>{level === "low" ? "Thấp" : level === "medium" ? "Trung bình" : "Cao"}</span>
                      <div><i className={`dr-batch-bar dr-batch-bar--${level}`} style={{ width: `${riskTotal ? Math.max(riskCounts[level] / riskTotal * 100, riskCounts[level] ? 2 : 0) : 0}%` }} /></div>
                      <b>{riskCounts[level]}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="dr-batch-results-toolbar">
              <label className="dr-batch-search">
                <Search aria-hidden="true" />
                <span className="sr-only">Tìm theo mã hoặc tên bệnh nhân</span>
                <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm mã hoặc tên bệnh nhân" />
              </label>
              <label className="dr-batch-risk-filter">Mức nguy cơ
                <select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value as RiskLevel | ""); setPage(1); }}>
                  <option value="">Tất cả</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="border-b border-slate-200"><tr><th className="th">Mã bệnh nhân</th><th className="th">Họ tên</th><th className="th">Mức nguy cơ</th><th className="th">Xác suất</th><th className="th">Yếu tố ảnh hưởng chính</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleRows.slice((page - 1) * pageSize, page * pageSize).map((r) => (
                    <tr key={r.predictionId}>
                      <td className="td">{r.patientCode ?? "—"}</td><td className="td">{r.fullName ?? "—"}</td>
                      <td className="td"><RiskBadge level={r.riskLevel} /></td><td className="td">{(r.probability * 100).toFixed(1)}%</td>
                      <td className="td text-xs">{r.topFactors.map((factor) => FEATURE_LABELS[factor] ?? factor).join(", ")}</td>
                    </tr>
                  ))}
                  {!visibleRows.length && <tr><td className="td text-slate-500" colSpan={5}>Không có kết quả phù hợp.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="dr-batch-pagination">
              <span>{visibleRows.length} kết quả phù hợp</span>
              <div>
                <button className="btn-ghost" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Trước</button>
                <span>Trang {page} / {Math.max(1, Math.ceil(visibleRows.length / pageSize))}</span>
                <button className="btn-ghost" onClick={() => setPage((current) => Math.min(Math.ceil(visibleRows.length / pageSize), current + 1))}
                  disabled={page >= Math.ceil(visibleRows.length / pageSize)}>Sau</button>
              </div>
            </div>
            {executionErrors.length > 0 && !archive && (
              <div className="mt-4"><Notice tone="error">{executionErrors.length} dòng không thể dự đoán. Những dòng thất bại được giữ trong lịch sử phiên.</Notice></div>
            )}
          </section>
        )}

        <section className="panel">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-slate-800">Lịch sử phiên dự đoán</h2>
            {archiveBusy && <Loader2 className="h-4 w-4 animate-spin" aria-label="Đang tải phiên" />}
          </div>
          {batchLoading ? <p className="text-sm text-slate-500" role="status">Đang tải lịch sử phiên...</p>
            : !batches.length ? <p className="text-sm text-slate-500">Chưa có phiên dự đoán hàng loạt.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead className="border-b border-slate-200"><tr><th className="th">Tệp</th><th className="th">Thời gian</th><th className="th">Thành công / tổng</th><th className="th">Trạng thái</th><th className="th">Thao tác</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((batch) => (
                    <tr key={batch.batchId}>
                      <td className="td">{batch.fileName}</td>
                      <td className="td">{new Date(batch.predictedAt || batch.createdAt).toLocaleString("vi-VN")}</td>
                      <td className="td">{batch.completedRows ?? 0} / {batch.totalRows}</td>
                      <td className="td">{batch.status ? batchStatusLabels[batch.status] ?? "Không xác định" : "—"}</td>
                      <td className="td"><div className="flex gap-2">
                        <button className="btn-ghost" onClick={() => void openBatch(batch.batchId)} disabled={archiveBusy === batch.batchId}>Chi tiết</button>
                        <button className="btn-ghost" onClick={() => void downloadResults(batch.batchId)} disabled={busy !== ""}><Download className="h-4 w-4" /> Tải</button>
                        <button className="dh-btn-danger" aria-label={`Xóa phiên ${batch.fileName}`} onClick={() => setToDeleteBatch(batch)}><Trash2 className="h-4 w-4" /> Xóa</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!batchLoading && batchTotal > BATCH_PAGE_SIZE && (
            <DgPagination page={batchPage} pageSize={BATCH_PAGE_SIZE} total={batchTotal} onPage={setBatchPage} noun="phiên dự đoán" />
          )}
        </section>
      </div>
      {toDeleteBatch && <ConfirmDialog
        title="Xóa phiên dự đoán hàng loạt"
        message={`Ẩn phiên “${toDeleteBatch.fileName}” khỏi lịch sử dự đoán? Hồ sơ bệnh nhân không bị xóa.`}
        confirmLabel="Xóa phiên"
        busy={deleteBusy}
        onConfirm={deleteBatch}
        onCancel={() => setToDeleteBatch(null)}
      />}
    </div>
  );
}
