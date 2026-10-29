import { useEffect, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import PredictionResultCard from "../../components/Sidebar";
import { Notice, SelectField, TextField } from "../../components/FormControls";
import { FEATURE_FIELDS, FEATURE_LABELS } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { Gender, Patient, PatientInfo, PredictionMode, PredictionResult } from "../../types";

const initialFeatures = (mode: PredictionMode) => Object.fromEntries(
  FEATURE_FIELDS[mode].map((field) => [field.name, field.defaultValue ?? ""]),
);

export default function HealthPredict({ mode, target }: { mode: PredictionMode; target: "self" | "patient" }) {
  const [features, setFeatures] = useState<Record<string, number | string>>(() => initialFeatures(mode));
  const [patientName, setPatientName] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [patientBirthdate, setPatientBirthdate] = useState("");
  const [patientGender, setPatientGender] = useState<Gender>("female");
  const [patientPhone, setPatientPhone] = useState("");
  const [existingPatients, setExistingPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientLoadError, setPatientLoadError] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFeatures(initialFeatures(mode));
    setResult(null);
  }, [mode]);

  useEffect(() => {
    if (target !== "patient") return;
    let active = true;
    mlService.patients({ pageSize: 100 })
      .then((response) => { if (active) setExistingPatients(response.items); })
      .catch((cause: unknown) => {
        if (active) setPatientLoadError(cause instanceof ApiError ? cause.message : "Không tải được hồ sơ bệnh nhân.");
      });
    return () => { active = false; };
  }, [target]);

  function setFeature(name: string, value: string) {
    const field = FEATURE_FIELDS[mode].find((item) => item.name === name);
    if (!field) return;
    if (field.kind === "number") {
      setFeatures((previous) => ({ ...previous, [name]: value === "" ? "" : Number(value) }));
      return;
    }
    const selected = field.options?.find((option) => String(option.value) === value)?.value ?? value;
    setFeatures((previous) => ({ ...previous, [name]: selected }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    const patient: PatientInfo | { patientId: string } | undefined = target !== "patient"
      ? undefined
      : selectedPatientId
        ? { patientId: selectedPatientId }
        : {
          fullName: patientName.trim(),
          ...(patientCode.trim() ? { patientCode: patientCode.trim() } : {}),
          ...(patientBirthdate ? { birthdate: patientBirthdate } : {}),
          gender: patientGender,
          ...(patientPhone.trim() ? { phone: patientPhone.trim() } : {}),
        };
    if (target === "patient" && !selectedPatientId && patientName.trim().length < 2) {
      setError("Vui lòng chọn hồ sơ bệnh nhân hoặc nhập họ tên hợp lệ.");
      return;
    }

    setBusy(true);
    try {
      setResult(await mlService.predict({ mode, target, patient, features }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không thể thực hiện dự đoán, vui lòng thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  const title = target === "self"
    ? "Tự đánh giá nguy cơ"
    : mode === "clinical" ? "Dự đoán lâm sàng cho bệnh nhân" : "Dự đoán phi lâm sàng cho bệnh nhân";

  return (
    <div>
      <Header title={title} subtitle="Nhập thông tin khảo sát để ước tính kết quả từ mô hình và lưu vào lịch sử." />
      <div className="space-y-4">
        <Notice tone="info">
          <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả không phải chẩn đoán.
          </span>
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        {target === "patient" && patientLoadError && <Notice tone="error">{patientLoadError}</Notice>}

        <form className="panel space-y-5" onSubmit={(event) => void submit(event)}>
          {target === "patient" && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Activity className="h-4 w-4 text-brand-600" />Hồ sơ bệnh nhân</h2>
              <SelectField id="patient-select" label="Chọn hồ sơ đã có (hoặc nhập bệnh nhân mới)" value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}>
                <option value="">-- Tạo hồ sơ mới --</option>
                {existingPatients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.patientCode} · {patient.fullName}</option>)}
              </SelectField>
              {!selectedPatientId && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField id="patient-name" label="Họ và tên" value={patientName} onChange={(event) => setPatientName(event.target.value)} required minLength={2} maxLength={120} />
                <TextField id="patient-code" label="Mã bệnh nhân (không bắt buộc)" value={patientCode} onChange={(event) => setPatientCode(event.target.value)} maxLength={40} />
                <TextField id="patient-birthdate" label="Ngày sinh" type="date" value={patientBirthdate} onChange={(event) => setPatientBirthdate(event.target.value)} />
                <SelectField id="patient-gender" label="Giới tính" value={patientGender} onChange={(event) => setPatientGender(event.target.value as Gender)}>
                  <option value="female">Nữ</option><option value="male">Nam</option>
                </SelectField>
                <TextField id="patient-phone" label="Số điện thoại" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} />
              </div>}
            </section>
          )}

          <section>
            <h2 className="mb-1 text-sm font-bold text-slate-800">Chỉ số {mode === "clinical" ? "lâm sàng" : "phi lâm sàng"}</h2>
            <p className="mb-3 text-xs leading-5 text-slate-500">
              Mô hình sử dụng các trường khảo sát BRFSS. Vui lòng nhập thông tin đã biết; tối đa {mode === "clinical" ? 2 : 3} trường được để trống. Chế độ lâm sàng bổ sung tiền sử và chẩn đoán tự khai, không nhận chỉ số xét nghiệm.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_FIELDS[mode].map((field) => field.kind === "select" ? (
                <SelectField key={field.name} id={`feature-${field.name}`} label={FEATURE_LABELS[field.name]} value={String(features[field.name] ?? "")}
                  onChange={(event) => setFeature(field.name, event.target.value)}
                  required={["sex"].includes(field.name)}>
                  <option value="">-- Chọn / không rõ --</option>
                  {field.options?.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
                </SelectField>
              ) : (
                <TextField key={field.name} id={`feature-${field.name}`} label={FEATURE_LABELS[field.name]} type="number" step={field.step}
                  min={field.min} max={field.max} value={features[field.name]}
                  onChange={(event) => setFeature(field.name, event.target.value)}
                  required={["age", "bmi"].includes(field.name)}
                />
              ))}
            </div>
          </section>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            {busy ? "Đang xử lý..." : "Dự đoán ngay"}
          </button>
        </form>

        {result && <section className="panel"><h2 className="mb-4 text-lg font-bold text-slate-800">Kết quả dự đoán</h2><PredictionResultCard result={result} /></section>}
      </div>
    </div>
  );
}
