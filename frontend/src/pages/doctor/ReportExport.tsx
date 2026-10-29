import { useEffect, useState, type FormEvent } from "react";
import { FileDown, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import { Notice, SelectField, TextField } from "../../components/FormControls";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { BatchSummary, Patient, ReportFormat, ReportScope } from "../../types";

/** UC-09: chọn phạm vi + định dạng (Excel/PDF) → backend tạo file → tải về. */
export default function ReportExport() {
  const [scope, setScope] = useState<ReportScope>("range");
  const [format, setFormat] = useState<ReportFormat>("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [patientId, setPatientId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mlService.patients({ pageSize: 100 }).then((r) => setPatients(r.items)).catch(() => undefined);
    mlService.batches().then(setBatches).catch(() => undefined);
  }, []);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setMsg(null);
    if (scope === "patient" && !patientId) { setMsg({ tone: "error", text: "Vui lòng chọn bệnh nhân" }); return; }
    if (scope === "batch" && !batchId) { setMsg({ tone: "error", text: "Vui lòng chọn đợt dự đoán" }); return; }
    if (scope === "range" && from && to && from > to) { setMsg({ tone: "error", text: "Ngày bắt đầu phải trước ngày kết thúc" }); return; }
    setBusy(true);
    try {
      await mlService.exportReport({
        scope, format,
        patientId: scope === "patient" ? patientId : undefined,
        batchId: scope === "batch" ? batchId : undefined,
        from: scope === "range" ? from || undefined : undefined,
        to: scope === "range" ? to || undefined : undefined,
      });
      setMsg({ tone: "success", text: "Đã tạo báo cáo và bắt đầu tải về." });
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không thể xuất báo cáo." });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <Header title="Xuất báo cáo" subtitle="Xuất kết quả dự đoán ra tệp Excel hoặc PDF" />
      <form onSubmit={onSubmit} className="panel max-w-2xl space-y-4" noValidate>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="r-scope" label="Phạm vi dữ liệu" value={scope} onChange={(e) => setScope(e.target.value as ReportScope)}>
            <option value="range">Theo khoảng thời gian</option><option value="patient">Một bệnh nhân</option><option value="batch">Một đợt hàng loạt</option>
          </SelectField>
          <SelectField id="r-format" label="Định dạng tệp" value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
            <option value="xlsx">Excel (.xlsx)</option><option value="pdf">PDF</option>
          </SelectField>
          {scope === "range" && (<>
            <TextField id="r-from" label="Từ ngày" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField id="r-to" label="Đến ngày" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>)}
          {scope === "patient" && (
            <SelectField id="r-patient" label="Bệnh nhân" className="sm:col-span-2" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">-- Chọn bệnh nhân --</option>
              {patients.map((p) => <option key={p.patientId} value={p.patientId}>{p.patientCode} – {p.fullName}</option>)}
            </SelectField>)}
          {scope === "batch" && (
            <SelectField id="r-batch" label="Đợt dự đoán" className="sm:col-span-2" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">-- Chọn đợt --</option>
              {batches.map((b) => <option key={b.batchId} value={b.batchId}>{b.fileName} ({b.validRows}/{b.totalRows} dòng)</option>)}
            </SelectField>)}
        </div>
        <button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Xuất báo cáo</button>
      </form>
    </div>
  );
}
