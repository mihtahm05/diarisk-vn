import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Eye, Loader2, Search, Trash2 } from "lucide-react";
import Header from "../../components/Header";
import { ConfirmDialog, Modal } from "../../components/Modal";
import Pagination from "../../components/Pagination";
import PredictionResultCard, { RiskBadge } from "../../components/PredictionResultCard";
import { Notice } from "../../components/FormControls";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import { formatDate, formatDateTime } from "../../utils/validators";
import type { Paged, Patient, PredictionListItem, PredictionResult, RiskLevel } from "../../types";

/** UC-08: tra cứu bệnh nhân → xem các lần dự đoán → xem chi tiết / xóa mềm bản ghi. */
export default function PatientList() {
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<RiskLevel | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Patient> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selected, setSelected] = useState<Patient | null>(null);
  const [preds, setPreds] = useState<PredictionListItem[] | null>(null);
  const [detail, setDetail] = useState<PredictionResult | null>(null);
  const [toDelete, setToDelete] = useState<PredictionListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await mlService.patients({ q, riskLevel: risk, page })); }
    catch (e) { setData(null); setError(e instanceof ApiError ? e.message : "Không tải được danh sách bệnh nhân."); }
    finally { setLoading(false); }
  }, [q, risk, page]);

  useEffect(() => { const t = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(t); }, [load]);

  async function open(p: Patient) {
    setSelected(p); setPreds(null); setError("");
    try { setPreds(await mlService.patientPredictions(p.patientId)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không tải được lịch sử."); }
  }
  async function view(id: string) {
    try { setDetail(await mlService.detail(id)); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không tải được chi tiết."); }
  }
  async function del() {
    if (!toDelete || !selected) return;
    setBusy(true);
    try { await mlService.remove(toDelete.predictionId); setToDelete(null); await open(selected); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Không xóa được bản ghi."); setToDelete(null); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <Header title="Tra cứu lịch sử bệnh nhân" subtitle="Tìm kiếm bệnh nhân và quản lý các lần dự đoán của bạn" />
      {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}

      {!selected ? (
        <div className="panel">
          <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input aria-label="Tìm theo tên hoặc mã bệnh nhân" className="field-input pl-9" placeholder="Tên hoặc mã bệnh nhân" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <select aria-label="Mức nguy cơ" className="field-input" value={risk} onChange={(e) => { setRisk(e.target.value as RiskLevel | ""); setPage(1); }}>
              <option value="">Mọi mức nguy cơ</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
            </select>
          </div>
          {loading ? <div className="flex justify-center py-10 text-brand-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : !data || data.items.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Không có dữ liệu phù hợp</p>
              : (<>
                <div className="overflow-x-auto"><table className="w-full min-w-[640px]">
                  <thead className="border-b border-slate-200"><tr><th className="th">Mã BN</th><th className="th">Họ tên</th><th className="th">SĐT</th><th className="th">Lần dự đoán</th><th className="th">Nguy cơ gần nhất</th><th className="th" /></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((p) => (
                      <tr key={p.patientId} className="hover:bg-brand-50/50">
                        <td className="td font-medium">{p.patientCode}</td><td className="td">{p.fullName}</td><td className="td">{p.phone ?? "—"}</td>
                        <td className="td">{p.predictionCount ?? "—"}</td><td className="td">{p.lastRiskLevel ? <RiskBadge level={p.lastRiskLevel} /> : "—"}</td>
                        <td className="td text-right"><button className="btn-ghost !px-3 !py-1" onClick={() => open(p)}>Xem lịch sử</button></td>
                      </tr>))}
                  </tbody></table></div>
                <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
              </>)}
        </div>
      ) : (
        <div className="panel">
          <button className="btn-ghost mb-3" onClick={() => { setSelected(null); setPreds(null); }}><ArrowLeft className="h-4 w-4" /> Danh sách bệnh nhân</button>
          <p className="mb-3 text-sm"><b>{selected.fullName}</b> · {selected.patientCode} · Ngày sinh: {formatDate(selected.birthdate)}</p>
          {preds === null ? <div className="flex justify-center py-8 text-brand-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : preds.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Chưa có dữ liệu dự đoán nào</p>
              : (<div className="overflow-x-auto"><table className="w-full min-w-[520px]">
                <thead className="border-b border-slate-200"><tr><th className="th">Thời gian</th><th className="th">Chế độ</th><th className="th">Mức nguy cơ</th><th className="th">Xác suất</th><th className="th text-right">Thao tác</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{preds.map((p) => (
                  <tr key={p.predictionId}><td className="td">{formatDateTime(p.createdAt)}</td><td className="td">{p.mode === "clinical" ? "Lâm sàng" : "Phi lâm sàng"}</td>
                    <td className="td"><RiskBadge level={p.riskLevel} /></td><td className="td">{(p.probability * 100).toFixed(1)}%</td>
                    <td className="td text-right"><button className="btn-ghost !px-2 !py-1" aria-label="Xem chi tiết" onClick={() => view(p.predictionId)}><Eye className="h-4 w-4" /></button>
                      <button className="btn-ghost ml-1 !px-2 !py-1 !text-red-600" aria-label="Xóa bản ghi" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4" /></button></td></tr>))}
                </tbody></table></div>)}
        </div>
      )}

      {detail && <Modal title="Chi tiết lần dự đoán" wide onClose={() => setDetail(null)}><PredictionResultCard result={detail} /></Modal>}
      {toDelete && <ConfirmDialog title="Xóa bản ghi" message="Bạn có chắc chắn muốn xóa bản ghi này?" confirmLabel="Xóa" busy={busy} onConfirm={del} onCancel={() => setToDelete(null)} />}
    </div>
  );
}
