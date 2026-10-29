import { useCallback, useEffect, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import { Modal } from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { Notice } from "../../components/FormControls";
import { ApiError } from "../../services/api";
import { adminService } from "../../services/adminService";
import { formatDateTime } from "../../utils/validators";
import type { ActivityLogRow, Paged } from "../../types";

/** UC-12: xem, lọc, xem chi tiết và xuất nhật ký hoạt động. */
export default function ActivityLogs() {
  const [actionType, setActionType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ActivityLogRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ActivityLogRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await adminService.logs({ actionType, q, from, to, page })); }
    catch (e) { setData(null); setError(e instanceof ApiError ? e.message : "Không tải được nhật ký."); }
    finally { setLoading(false); }
  }, [actionType, q, from, to, page]);
  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t); }, [load]);

  async function exportLogs(format: "xlsx" | "csv") {
    setExporting(true); setError("");
    try { await adminService.exportLogs(format, { actionType, q, from, to }); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Lỗi khi xuất file."); }
    finally { setExporting(false); }
  }
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <Header title="Nhật ký hệ thống" subtitle="Theo dõi các hoạt động quan trọng của hệ thống"
        actions={<div className="flex gap-2">
          <button className="btn-ghost" onClick={() => exportLogs("xlsx")} disabled={exporting}><Download className="h-4 w-4" /> Excel</button>
          <button className="btn-ghost" onClick={() => exportLogs("csv")} disabled={exporting}><Download className="h-4 w-4" /> CSV</button></div>} />
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
      <div className="panel">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="field-label" htmlFor="l-action">Loại hành động</label><input id="l-action" className="field-input" placeholder="vd. LOGIN, PREDICT" value={actionType} onChange={(e) => reset(() => setActionType(e.target.value))} /></div>
          <div><label className="field-label" htmlFor="l-q">Tài khoản thực hiện</label><input id="l-q" className="field-input" placeholder="Tên hoặc email" value={q} onChange={(e) => reset(() => setQ(e.target.value))} /></div>
          <div><label className="field-label" htmlFor="l-from">Từ ngày</label><input id="l-from" type="date" className="field-input" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} /></div>
          <div><label className="field-label" htmlFor="l-to">Đến ngày</label><input id="l-to" type="date" className="field-input" value={to} onChange={(e) => reset(() => setTo(e.target.value))} /></div>
        </div>
        {loading ? <div className="flex justify-center py-10 text-brand-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
          : !data || data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Không có bản ghi phù hợp</p>
            : (<><div className="overflow-x-auto"><table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-200"><tr><th className="th">Thời gian</th><th className="th">Người thực hiện</th><th className="th">Hành động</th><th className="th">Đối tượng</th><th className="th">Mô tả</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.items.map((l) => (
                <tr key={l.logId}><td className="td whitespace-nowrap text-xs">{formatDateTime(l.createdAt)}</td><td className="td">{l.userName ?? l.userId ?? "—"}</td>
                  <td className="td"><span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{l.actionType}</span></td>
                  <td className="td text-xs">{l.targetTable ?? "—"}</td><td className="td max-w-[260px] truncate text-xs" title={l.description}>{l.description}</td>
                  <td className="td text-right"><button className="btn-ghost !px-2 !py-1" aria-label="Xem chi tiết" onClick={() => setDetail(l)}><Eye className="h-4 w-4" /></button></td></tr>))}
              </tbody></table></div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /></>)}
      </div>
      {detail && <Modal title="Chi tiết nhật ký" onClose={() => setDetail(null)}>
        <dl className="space-y-2 text-sm">{([
          ["Thời gian", formatDateTime(detail.createdAt)], ["Người thực hiện", detail.userName ?? detail.userId ?? "—"], ["Hành động", detail.actionType],
          ["Đối tượng", `${detail.targetTable ?? "—"} ${detail.targetId ?? ""}`], ["Địa chỉ IP", detail.ipAddress ?? "—"], ["Mô tả", detail.description]] as const)
          .map(([k, v]) => (<div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="break-words">{v}</dd></div>))}</dl></Modal>}
    </div>
  );
}
