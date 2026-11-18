import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Eye, Loader2, Search, Trash2 } from "lucide-react";
import Header from "../../components/Header";
import { ConfirmDialog, Modal } from "../../components/Modal";
import PredictionResultCard, { RiskBadge } from "../../components/Sidebar";
import { DgPagination, FilterTabs, MessageBox, ModeBadge, Probability, localDateKey, splitDateTime } from "../../components/HistoryUI";
import { FEATURE_LABELS } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { Patient, PredictionListItem, PredictionMode, PredictionResult, RiskLevel } from "../../types";
import "../../dashboard.css";

const PAGE_SIZE = 6;

type ModeTab = "all" | PredictionMode;
type Row = { prediction: PredictionListItem; patient: Patient };
type Factor = { label: string; up: boolean };
type Extra = { bmi?: number; factors: Factor[] };

/** Lấy tối đa 2 yếu tố có ảnh hưởng lớn nhất từ dữ liệu SHAP (nhận nhiều dạng dữ liệu, không nhận ra thì trả mảng rỗng). */
function topFactors(shap: unknown): Factor[] {
  const entries: { name: string; value: number }[] = [];
  const push = (name: unknown, value: unknown) => {
    const number = Number(value);
    if (typeof name === "string" && Number.isFinite(number) && number !== 0) entries.push({ name, value: number });
  };
  if (Array.isArray(shap)) {
    for (const item of shap) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        push(o.feature ?? o.name ?? o.label, o.value ?? o.shap ?? o.contribution ?? o.impact);
      }
    }
  } else if (shap && typeof shap === "object") {
    const o = shap as Record<string, unknown>;
    if (Array.isArray(o.features)) return topFactors(o.features);
    if (Array.isArray(o.values)) return topFactors(o.values);
    for (const [name, value] of Object.entries(o)) push(name, value);
  }
  return entries
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 2)
    .map((entry) => ({ label: FEATURE_LABELS[entry.name] ?? entry.name, up: entry.value > 0 }));
}

function toExtra(result: PredictionResult): Extra {
  const inputs = result.inputs as Record<string, unknown> | undefined;
  const raw = inputs?.bmi;
  const bmi = raw === undefined || raw === "" ? NaN : Number(raw);
  return { bmi: Number.isFinite(bmi) ? bmi : undefined, factors: topFactors(result.shap) };
}

/** UC-08: lịch sử các lần dự đoán của bệnh nhân. Mỗi dòng là một lần đánh giá; lọc theo chế độ, mức nguy cơ, khoảng ngày; xem chi tiết hoặc xóa mềm. */
export default function PatientList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [q, setQ] = useState("");
  const [modeTab, setModeTab] = useState<ModeTab>("all");
  const [draft, setDraft] = useState<{ risk: RiskLevel | ""; from: string; to: string }>({ risk: "", from: "", to: "" });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);

  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const requested = useRef(new Set<string>());

  const [detail, setDetail] = useState<PredictionResult | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  /** Gộp các lần dự đoán của mọi bệnh nhân thành một danh sách phẳng, mới nhất ở trên. */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const patients = await mlService.patients({ pageSize: 100 });
      const lists = await Promise.all(patients.items.map(async (patient) => {
        const predictions = await mlService.patientPredictions(patient.patientId);
        return predictions.map((prediction) => ({ prediction, patient }));
      }));
      const all = lists.reduce<Row[]>((sum, list) => sum.concat(list), []);
      all.sort((a, b) => new Date(b.prediction.createdAt).getTime() - new Date(a.prediction.createdAt).getTime());
      setRows(all);
    } catch (cause) {
      setRows(null);
      setError(cause instanceof ApiError ? cause.message : "Không tải được lịch sử bệnh nhân.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void loadAll(); }, [loadAll]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => (rows ?? []).filter(({ prediction, patient }) => {
    if (modeTab !== "all" && prediction.mode !== modeTab) return false;
    if (applied.risk && prediction.riskLevel !== applied.risk) return false;
    const key = localDateKey(prediction.createdAt);
    if (applied.from && key < applied.from) return false;
    if (applied.to && key > applied.to) return false;
    if (needle && !`${patient.fullName} ${patient.patientCode} ${patient.phone ?? ""}`.toLowerCase().includes(needle)) return false;
    return true;
  }), [rows, modeTab, applied, needle]);

  useEffect(() => { setPage(1); }, [modeTab, applied, needle]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);

  // BMI và yếu tố chính chỉ tải cho các dòng đang hiển thị trên trang hiện tại
  useEffect(() => {
    const ids = pageItems.map((row) => row.prediction.predictionId).filter((id) => !requested.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => requested.current.add(id));
    void Promise.all(ids.map(async (id) => {
      try {
        return [id, toExtra(await mlService.detail(id))] as const;
      } catch {
        return [id, { factors: [] } as Extra] as const;
      }
    })).then((entries) => setExtras((previous) => ({ ...previous, ...Object.fromEntries(entries) })));
  }, [pageItems]);

  const counts = {
    all: rows?.length ?? 0,
    nonclinical: rows?.filter((row) => row.prediction.mode === "nonclinical").length ?? 0,
    clinical: rows?.filter((row) => row.prediction.mode === "clinical").length ?? 0,
  };

  const dateError = draft.from && draft.to && draft.from > draft.to ? "Ngày bắt đầu phải trước ngày kết thúc." : "";
  const hasFilter = modeTab !== "all" || q !== "" || applied.risk !== "" || applied.from !== "" || applied.to !== "";

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (dateError) return;
    setApplied(draft);
  }
  function resetFilters() {
    const empty = { risk: "" as RiskLevel | "", from: "", to: "" };
    setQ(""); setModeTab("all"); setDraft(empty); setApplied(empty);
  }

  async function view(id: string) {
    setError("");
    try { setDetail(await mlService.detail(id)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Không tải được chi tiết."); }
  }
  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await mlService.remove(toDelete.prediction.predictionId);
      setToDelete(null);
      await loadAll();
      setNotice("Đã xóa bản ghi dự đoán thành công.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không xóa được bản ghi.");
      setToDelete(null);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <Header title="Lịch sử bệnh nhân" subtitle="Các lần đánh giá của bệnh nhân theo chế độ phi lâm sàng và lâm sàng" />
      {error && <div className="mb-3"><MessageBox tone="error">{error}</MessageBox></div>}
      {notice && <div className="mb-3"><MessageBox tone="success">{notice}</MessageBox></div>}

      <section className="dh-hist-card">
        <FilterTabs<ModeTab> label="Lọc theo chế độ" value={modeTab} onChange={setModeTab}
          tabs={[
            { id: "all", label: "Tất cả", count: counts.all },
            { id: "nonclinical", label: "Phi lâm sàng", count: counts.nonclinical },
            { id: "clinical", label: "Lâm sàng", count: counts.clinical },
          ]} />

        <div className="dh-search dh-search--bar">
          <Search aria-hidden="true" />
          <input className="dg-input" aria-label="Tìm theo tên, mã hoặc số điện thoại bệnh nhân" placeholder="Tìm kiếm tên, mã hoặc số điện thoại bệnh nhân"
            value={q} onChange={(event) => setQ(event.target.value)} />
        </div>

        <form className="dh-toolbar" onSubmit={applyFilters}>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="f-risk">Mức nguy cơ</label>
            <select id="f-risk" className="dg-input" value={draft.risk} onChange={(event) => setDraft({ ...draft, risk: event.target.value as RiskLevel | "" })}>
              <option value="">Tất cả</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
            </select>
          </div>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="f-from">Từ ngày</label>
            <input id="f-from" className="dg-input" type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
          </div>
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="f-to">Đến ngày</label>
            <input id="f-to" className="dg-input" type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
          </div>
          <div className="dh-filter-actions">
            <button type="submit" className="dh-btn-filter">Lọc</button>
            {hasFilter && <button type="button" className="dh-btn-soft" onClick={resetFilters}>Đặt lại</button>}
          </div>
        </form>
        {dateError && <p className="dg-field-error" role="alert">{dateError}</p>}

        {loading ? <div className="dh-loading"><Loader2 className="dg-spin" aria-label="Đang tải" /></div>
          : !rows || rows.length === 0 ? <p className="dh-empty">Chưa có lần dự đoán nào của bệnh nhân. Hãy thực hiện dự đoán ở mục "Dự đoán cho bệnh nhân".</p>
            : filtered.length === 0 ? <p className="dh-empty">Không tìm thấy lịch sử dự đoán phù hợp với bộ lọc đã chọn.</p>
              : (<>
                <div className="dh-table-wrap">
                  <table className="dh-table dh-table--wide">
                    <thead>
                      <tr>
                        <th>Ngày đánh giá</th><th>Bệnh nhân</th><th>Chế độ</th><th>Xác suất</th><th>Mức nguy cơ</th><th>BMI</th><th>Yếu tố chính</th>
                        <th><span className="sr-only">Thao tác</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((row) => {
                        const { prediction, patient } = row;
                        const when = splitDateTime(prediction.createdAt);
                        const extra = extras[prediction.predictionId];
                        return (
                          <tr key={prediction.predictionId}>
                            <td><span className="dh-cell-strong">{when.date}</span><span className="dh-cell-sub">{when.time}</span></td>
                            <td><span className="dh-cell-strong">{patient.fullName}</span><span className="dh-cell-sub">{patient.phone ?? patient.patientCode}</span></td>
                            <td><ModeBadge mode={prediction.mode} /></td>
                            <td><Probability value={prediction.probability} level={prediction.riskLevel} /></td>
                            <td><RiskBadge level={prediction.riskLevel} /></td>
                            <td>{extra ? (extra.bmi !== undefined ? extra.bmi.toFixed(1) : "—") : <span className="dh-cell-sub">…</span>}</td>
                            <td>
                              {extra
                                ? extra.factors.length
                                  ? <ul className="dh-factors">{extra.factors.map((factor) => (
                                    <li key={factor.label} className={factor.up ? "is-up" : "is-down"}><span aria-hidden="true">{factor.up ? "↑" : "↓"}</span>{factor.label}</li>
                                  ))}</ul>
                                  : "—"
                                : <span className="dh-cell-sub">…</span>}
                            </td>
                            <td>
                              <span className="dh-row-actions">
                                <button type="button" className="dh-btn-soft" onClick={() => void view(prediction.predictionId)}><Eye aria-hidden="true" /> Xem chi tiết</button>
                                <button type="button" className="dh-btn-danger" aria-label="Xóa bản ghi" onClick={() => setToDelete(row)}><Trash2 aria-hidden="true" /></button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <DgPagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} noun="lần đánh giá" />
              </>)}
      </section>

      {detail && <Modal title="Chi tiết lần dự đoán" wide onClose={() => setDetail(null)}><PredictionResultCard result={detail} /></Modal>}
      {toDelete && <ConfirmDialog title="Xóa bản ghi" message="Bạn có chắc chắn muốn xóa bản ghi này?" confirmLabel="Xóa" busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)} />}
    </div>
  );
}
