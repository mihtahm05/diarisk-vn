import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import Header from "./Header";
import { Modal } from "./Modal";
import PredictionResultCard, { RiskBadge } from "./Sidebar";
import { DgPagination, MessageBox, ModeBadge, Probability, splitDateTime } from "./HistoryUI";
import { ApiError } from "../services/api";
import { mlService } from "../services/mlService";
import type { PredictionListItem, PredictionResult, RiskLevel } from "../types";
import "../dashboard.css";

/** UC-05: lịch sử dự đoán cá nhân (người dùng và cán bộ y tế). Dữ liệu phân trang và lọc ở backend. */
export function OwnHistoryPage() {
  const [page, setPage] = useState(1);
  const [risk, setRisk] = useState<RiskLevel | "">("");
  const [data, setData] = useState<{ items: PredictionListItem[]; total: number; page: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<PredictionResult | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await mlService.history({ scope: "mine", riskLevel: risk, page }));
    } catch (cause) {
      setData(null);
      setError(cause instanceof ApiError ? cause.message : "Không tải được lịch sử dự đoán.");
    } finally {
      setLoading(false);
    }
  }, [page, risk]);
  useEffect(() => { void load(); }, [load]);

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

  const empty = !loading && !data?.items.length;

  return (
    <div>
      <Header title="Lịch sử dự đoán cá nhân" subtitle="Chỉ hiển thị các lần tự đánh giá của tài khoản đang đăng nhập" />
      {error && <div className="mb-3"><MessageBox tone="error">{error}</MessageBox></div>}

      <section className="dh-hist-card">
        <div className="dh-toolbar">
          <div className="dh-toolbar-field">
            <label className="dg-label" htmlFor="history-risk">Mức nguy cơ</label>
            <select id="history-risk" className="dg-input" value={risk}
              onChange={(event) => { setRisk(event.target.value as RiskLevel | ""); setPage(1); }}>
              <option value="">Tất cả</option><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option>
            </select>
          </div>
          <span className="dh-toolbar-end">{data?.total ?? 0} lần dự đoán</span>
        </div>

        {loading ? (
          <div className="dh-loading"><Loader2 className="dg-spin" aria-label="Đang tải" /></div>
        ) : empty ? (
          <p className="dh-empty">{risk ? "Không tìm thấy lịch sử dự đoán phù hợp với bộ lọc đã chọn." : "Chưa có dữ liệu dự đoán nào."}</p>
        ) : data && (
          <>
            <div className="dh-table-wrap">
              <table className="dh-table">
                <thead>
                  <tr><th>Ngày đánh giá</th><th>Chế độ</th><th>Xác suất</th><th>Mức nguy cơ</th><th><span className="sr-only">Thao tác</span></th></tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const when = splitDateTime(item.createdAt);
                    return (
                      <tr key={item.predictionId}>
                        <td><span className="dh-cell-strong">{when.date}</span><span className="dh-cell-sub">{when.time}</span></td>
                        <td><ModeBadge mode={item.mode} /></td>
                        <td><Probability value={item.probability} level={item.riskLevel} /></td>
                        <td><RiskBadge level={item.riskLevel} /></td>
                        <td>
                          <button type="button" className="dh-btn-soft" onClick={() => void showDetail(item.predictionId)} disabled={busyId === item.predictionId}>
                            {busyId === item.predictionId ? <Loader2 className="dg-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />} Xem chi tiết
                          </button>
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

      {detail && <Modal title="Chi tiết dự đoán" wide onClose={() => setDetail(null)}><PredictionResultCard result={detail} /></Modal>}
    </div>
  );
}
