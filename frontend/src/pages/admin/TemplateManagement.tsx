import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import Header from "../../components/Header";
import { Notice, TextField } from "../../components/FormControls";
import { ApiError } from "../../services/api";
import { adminService } from "../../services/adminService";
import { formatDateTime } from "../../utils/validators";
import type { ExcelTemplate } from "../../types";

/** UC-11: danh sách tệp mẫu Excel, tải lên mẫu mới (.xlsx), bật/tắt sử dụng. */
export default function TemplateManagement() {
  const [items, setItems] = useState<ExcelTemplate[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  const load = () => adminService.templates().then(setItems).catch((e) => { setItems([]); setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không tải được danh sách tệp mẫu." }); });
  useEffect(() => { void load(); }, []);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setMsg(null);
    if (!file) return setMsg({ tone: "error", text: "Vui lòng chọn tệp Excel mẫu (.xlsx)" });
    if (!/\.xlsx$/i.test(file.name)) return setMsg({ tone: "error", text: "Định dạng tệp không hợp lệ. Vui lòng tải lên tệp Excel (.xlsx)" });
    if (!name.trim() || !version.trim()) return setMsg({ tone: "error", text: "Vui lòng nhập tên và phiên bản tệp mẫu" });
    setBusy(true);
    try {
      await adminService.uploadTemplate(file, name.trim(), version.trim());
      setMsg({ tone: "success", text: "Cập nhật tệp mẫu thành công" });
      setFile(null); setName(""); setVersion(""); setFileKey((k) => k + 1);
      await load();
    } catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không tải được tệp lên." }); }
    finally { setBusy(false); }
  }

  async function toggle(t: ExcelTemplate) {
    try { await adminService.setTemplateActive(t.templateId, !t.isActive); await load(); }
    catch (e) { setMsg({ tone: "error", text: e instanceof ApiError ? e.message : "Không cập nhật được trạng thái." }); }
  }

  return (
    <div>
      <Header title="Quản lý tệp mẫu" subtitle="Tệp Excel mẫu dùng cho dự đoán hàng loạt" />
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <form onSubmit={onSubmit} noValidate className="panel mb-4 grid gap-4 sm:grid-cols-2">
        <TextField id="t-name" label="Tên tệp mẫu" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField id="t-version" label="Phiên bản" value={version} onChange={(e) => setVersion(e.target.value)} />
        <div className="sm:col-span-2">
          <label htmlFor="t-file" className="field-label">Tệp Excel (.xlsx)</label>
          <input key={fileKey} id="t-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700" />
        </div>
        <div><button className="btn-primary" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Cập nhật</button></div>
      </form>

      <div className="panel">
        {items === null ? <div className="flex justify-center py-8 text-brand-600"><Loader2 className="h-6 w-6 animate-spin" /></div>
          : items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Chưa có tệp mẫu nào</p>
            : <div className="overflow-x-auto"><table className="w-full min-w-[560px]">
              <thead className="border-b border-slate-200"><tr><th className="th">Tên mẫu</th><th className="th">Tệp</th><th className="th">Phiên bản</th><th className="th">Tải lên</th><th className="th">Trạng thái</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{items.map((t) => (
                <tr key={t.templateId}><td className="td font-medium">{t.templateName}</td><td className="td text-xs">{t.fileName}</td><td className="td">{t.version}</td><td className="td text-xs">{formatDateTime(t.uploadedAt)}</td>
                  <td className="td"><button onClick={() => toggle(t)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`} aria-pressed={t.isActive}>{t.isActive ? "Đang dùng" : "Ngưng dùng"}</button></td></tr>))}
              </tbody></table></div>}
      </div>
    </div>
  );
}
