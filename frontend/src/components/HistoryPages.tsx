import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, Eye, Loader2, Trash2 } from "lucide-react";
import Header from "./Header";
import { ConfirmDialog, Modal } from "./Modal";
import { PredictionResultView } from "./PredictionPresentation";
import { RiskBadge } from "./Sidebar";
import { DgPagination, MessageBox, ModeBadge, Probability, splitDateTime } from "./HistoryUI";
import { FEATURE_LABELS } from "../config/features";
import { ApiError } from "../services/api";
import { mlService } from "../services/mlService";
import type { PredictionListItem, PredictionResult, RiskLevel } from "../types";
import "../dashboard.css";

type HistoryFilters = { risk: RiskLevel | ""; from: string; to: string };
type HistoryExtra = { bmi?: number; factors: { label: string; up: boolean }[]; error?: boolean };

const EMPTY_FILTERS: HistoryFilters = { risk: "", from: "", to: "" };

function summarizePrediction(result: PredictionResult): HistoryExtra {
  const rawBmi = result.inputs?.bmi;
  const bmi = rawBmi === undefined || rawBmi === "" ? NaN : Number(rawBmi);
  const factors = [...result.shap]
    .sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap))
    .slice(0, 2)
    .map((item) => ({
      label: item.label ?? FEATURE_LABELS[item.feature] ?? item.feature,
      up: item.shap > 0,
    }));
  return { bmi: Number.isFinite(bmi) ? bmi : undefined, factors };
}

/** UC-05: lịch sử dự đoán cá nhân (người dùng và cán bộ y tế). Dữ liệu phân trang và lọc ở backend. */
export function OwnHistoryPage() {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS);
  const [data, setData] = useState<{ items: PredictionListItem[]; total: number; page: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<PredictionResult | null>(null);
  const [toDelete, setToDelete] = useState<PredictionListItem | null>(null);
  const [extras, setExtras] = useState<Record<string, HistoryExtra>>({});
  const [busyId, setBusyId] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const requested = useRef(new Set<string>());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await mlService.history({
        scope: "mine",
        riskLevel: filters.risk,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page,
      }));
    } catch (cause) {
      setData(null);
      setError(cause instanceof ApiError ? cause.message : "Không tải được lịch sử dự đoán.");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const ids = (data?.items ?? []).map((item) => item.predictionId).filter((id) => !requested.current.has(id));
    if (!ids.length) return;
    ids.forEach((id) => requested.current.add(id));
    void Promise.all(ids.map(async (id) => {
      try {
        return [id, summarizePrediction(await mlService.detail(id))] as const;
      } catch {
        return [id, { factors: [], error: true } as HistoryExtra] as const;
      }
    })).then((entries) => setExtras((previous) => ({ ...previous, ...Object.fromEntries(entries) })));
  }, [data?.items]);

  async function showDetail(id: string) {
    setBusyId(id);
    setError("");
    try {
      setDetail(await mlService.detail(id));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không tải được chi tiết dự đoán.");
    } finally {
      setBusyId("");
    }
  }

  async function downloadDetail() {
    if (!detail) return;
    setDownloadBusy(true);
    setError("");
    try {
      await mlService.downloadPredictionPdf(detail.predictionId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không thể tải tệp PDF.");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleteBusy(true);
    setError("");
    try {
      await mlService.remove(toDelete.predictionId);
      const previousPageNeeded = data?.items.length === 1 && page > 1;
      setToDelete(null);
      setNotice("Đã xóa lần đánh giá khỏi lịch sử cá nhân.");
      if (previousPageNeeded) setPage((current) => current - 1);
      else await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không xóa được lần đánh giá.");
      setToDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const dateError = draft.from && draft.to && draft.from > draft.to ? "Ngày bắt đầu phải trước ngày kết thúc." : "";
  const hasFilter = filters.risk !== "" || filters.from !== "" || filters.to !== "";
  const empty = !loading && !data?.items.length;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateError) return;
    setPage(1);
    setFilters(draft);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div>
      <Header title="Lịch sử dự đoán cá nhân" subtitle="Chỉ hiển thị các lần tự đánh giá của tài khoản đang đăng nhập" />
      {error && <div className="mb-3"><MessageBox tone="error">{error}</MessageBox></div>}
      {notice && <div className="mb-3"><MessageBox tone="success">{notice}</MessageBox></div>}

      <section className="dh-hist-card">
        <form className="dh-toolbar" onSubmit={applyFilters}>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="history-risk">Mức nguy cơ</label>
            <select id="history-risk" className="dg-input" value={draft.risk}
              onChange={(event) => setDraft({ ...draft, risk: event.target.value as RiskLevel | "" })}>
              <option value="">Tất cả</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
            </select>
          </div>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="history-from">Từ ngày</label>
            <input id="history-from" className="dg-input" type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </div>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="history-to">Đến ngày</label>
            <input id="history-to" className="dg-input" type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </div>
          <div className="dh-filter-actions">
            <button type="submit" className="dh-btn-filter">Lọc</button>
            {hasFilter && <button type="button" className="dh-btn-soft" onClick={resetFilters}>Đặt lại</button>}
          </div>
        </form>
        {dateError && <p className="dg-field-error" role="alert">{dateError}</p>}
        <span className="dh-toolbar-end">{data?.total ?? 0} lần đánh giá</span>

        {loading ? (
          <div className="dh-loading"><Loader2 className="dg-spin" aria-label="Đang tải" /></div>
        ) : empty ? (
          <p className="dh-empty">{hasFilter ? "Không tìm thấy lịch sử dự đoán phù hợp với bộ lọc đã chọn." : "Chưa có dữ liệu dự đoán nào."}</p>
        ) : data && (
          <>
            <div className="dh-table-wrap">
              <table className="dh-table dh-table--wide">
                <thead>
                  <tr><th>Ngày đánh giá</th><th>Chế độ</th><th>Xác suất</th><th>Mức nguy cơ</th><th>BMI</th><th>Yếu tố chính</th><th>Thao tác</th></tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const when = splitDateTime(item.createdAt);
                    const extra = extras[item.predictionId];
                    return (
                      <tr key={item.predictionId}>
                        <td><span className="dh-cell-strong">{when.date}</span><span className="dh-cell-sub">{when.time}</span></td>
                        <td><ModeBadge mode={item.mode} /></td>
                        <td><Probability value={item.probability} level={item.riskLevel} /></td>
                        <td><RiskBadge level={item.riskLevel} /></td>
                        <td>{extra ? (extra.error ? "Không tải được" : extra.bmi !== undefined ? extra.bmi.toFixed(1) : "—") : <span className="dh-cell-sub">…</span>}</td>
                        <td>
                          {extra
                            ? extra.error ? "Không tải được" : extra.factors.length
                              ? <ul className="dh-factors">{extra.factors.map((factor) => (
                                <li key={factor.label} className={factor.up ? "is-up" : "is-down"}><span aria-hidden="true">{factor.up ? "↑" : "↓"}</span>{factor.label}</li>
                              ))}</ul>
                              : "—"
                            : <span className="dh-cell-sub">…</span>}
                        </td>
                        <td>
                          <span className="dh-row-actions">
                            <button type="button" className="dh-btn-soft" onClick={() => void showDetail(item.predictionId)} disabled={busyId === item.predictionId}>
                              {busyId === item.predictionId ? <Loader2 className="dg-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />} Xem chi tiết
                            </button>
                            <button type="button" className="dh-btn-danger" aria-label={`Xóa lần đánh giá ngày ${when.date}`} onClick={() => setToDelete(item)}>
                              <Trash2 aria-hidden="true" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DgPagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="lần đánh giá" />
          </>
        )}
      </section>

      {detail && <Modal title="Chi tiết dự đoán" wide onClose={() => setDetail(null)}>
        <PredictionResultView result={detail} showActions={false} />
        <button type="button" className="btn-ghost mt-4" onClick={() => void downloadDetail()} disabled={downloadBusy}>
          {downloadBusy ? <Loader2 className="dg-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Tải kết quả PDF
        </button>
      </Modal>}
      {toDelete && <ConfirmDialog
        title="Xóa lần đánh giá"
        message="Bạn có chắc chắn muốn xóa lần đánh giá này khỏi lịch sử cá nhân?"
        confirmLabel="Xóa lần đánh giá"
        busy={deleteBusy}
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />}
    </div>
  );
}
