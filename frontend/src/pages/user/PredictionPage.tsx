import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, AlertTriangle, CircleAlert, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import PredictionResultCard from "../../components/Sidebar";
import { FEATURE_FIELDS, FEATURE_GROUPS, FEATURE_HINTS, FEATURE_LABELS, type FeatureField, type FeatureOption } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { Gender, Patient, PatientInfo, PredictionMode, PredictionResult } from "../../types";
import "../../dashboard.css";

const REQUIRED = ["age", "sex", "bmi"];
// Số câu được bỏ trống, theo notebook huấn luyện:
// phần thông tin chung tối đa 3 câu, phần tiền sử bệnh (chế độ lâm sàng) tối đa 2 câu, hai mức tính riêng.
const MAX_MISSING_GENERAL = 3;
const MAX_MISSING_HISTORY = 2;

/** Các câu được tự điền theo cách bộ dữ liệu BRFSS và notebook xử lý. */
function lockedFields(mode: PredictionMode, features: Record<string, number | string>): Record<string, string> {
  const locked: Record<string, string> = {};
  if (mode !== "clinical") return locked;
  // BPMEDS chỉ được hỏi người có huyết áp cao; notebook gán 0 khi không có huyết áp cao.
  if (features.high_bp === 0) locked.bp_meds = "Tự động là Không vì chưa có huyết áp cao";
  // _MICHD gồm cả nhồi máu cơ tim, nên đã nhồi máu thì chắc chắn là Có.
  if (features.heart_attack === 1) locked.heart_disease = "Tự động là Có vì đã từng nhồi máu cơ tim";
  return locked;
}

/** Giá trị thực sự gửi đi sau khi áp dụng các câu tự điền. */
function applyRules(mode: PredictionMode, features: Record<string, number | string>): Record<string, number | string> {
  const next = { ...features };
  const locked = lockedFields(mode, features);
  if (locked.bp_meds) next.bp_meds = 0;
  if (locked.heart_disease) next.heart_disease = 1;
  return next;
}

const initialFeatures = (mode: PredictionMode) => Object.fromEntries(
  FEATURE_FIELDS[mode].map((field) => [field.name, field.defaultValue ?? ""]),
);

type BmiTone = "empty" | "under" | "normal" | "over" | "obese";

function bmiCategory(bmi: number | null): { tone: BmiTone; label: string } {
  if (bmi === null) return { tone: "empty", label: "Nhập chiều cao và cân nặng để tính" };
  if (bmi < 18.5) return { tone: "under", label: "Thiếu cân" };
  if (bmi < 25) return { tone: "normal", label: "Bình thường" };
  if (bmi < 30) return { tone: "over", label: "Thừa cân" };
  return { tone: "obese", label: "Béo phì" };
}

function Field({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div>
      {id ? <label className="dg-label" htmlFor={id}>{label}</label> : <span className="dg-label">{label}</span>}
      {children}
    </div>
  );
}

function Row({ label, hint, labelFor, control, children }: {
  label: string;
  hint?: string;
  labelFor?: string;
  control: "seg" | "select" | "num";
  children: ReactNode;
}) {
  return (
    <div className="dg-row">
      <div className="dg-row-text">
        {labelFor
          ? <label className="dg-row-label" htmlFor={labelFor}>{label}</label>
          : <span className="dg-row-label">{label}</span>}
        {hint && <p className="dg-row-hint">{hint}</p>}
      </div>
      <div className={`dg-row-control dg-row-control--${control}`}>{children}</div>
    </div>
  );
}

function Segmented({ label, options, value, onChange, disabled = false }: {
  label: string;
  options: FeatureOption[];
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="dg-seg" role="group" aria-label={label}>
      {options.map((option) => {
        const on = String(value) === String(option.value);
        return (
          <button key={String(option.value)} type="button" aria-pressed={on} disabled={disabled}
            className={on ? (option.value === "" ? "is-on is-skip" : "is-on") : undefined}
            onClick={() => onChange(String(option.value))}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ step, title, hint, children }: { step?: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="dg-sec-head">
        {step !== undefined && <span className="dg-step">{step}</span>}
        <div>
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

interface HealthPredictProps {
  mode: PredictionMode;
  target: "self" | "patient";
  hideHeader?: boolean;
}

export default function HealthPredict({ mode, target, hideHeader = false }: HealthPredictProps) {
  const [features, setFeatures] = useState<Record<string, number | string>>(() => initialFeatures(mode));
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
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

  const bmi = useMemo(() => {
    const h = Number(height);
    const w = Number(weight);
    if (!height || !weight || !(h > 0) || !(w > 0)) return null;
    const value = Math.round((w / ((h / 100) ** 2)) * 10) / 10;
    return value >= 10 && value <= 100 ? value : null;
  }, [height, weight]);
  const bmiOutOfRange = Boolean(height && weight) && bmi === null;
  const category = bmiCategory(bmi);

  const effective = useMemo(() => applyRules(mode, features), [mode, features]);
  const locked = useMemo(() => lockedFields(mode, features), [mode, features]);
  const isBlank = (field: FeatureField) => effective[field.name] === "" || effective[field.name] === undefined;
  const generalOptional = FEATURE_FIELDS[mode].filter((field) => field.group !== "history" && !REQUIRED.includes(field.name));
  const historyOptional = FEATURE_FIELDS[mode].filter((field) => field.group === "history");
  const generalOver = Math.max(0, generalOptional.filter(isBlank).length - MAX_MISSING_GENERAL);
  const historyOver = Math.max(0, historyOptional.filter(isBlank).length - MAX_MISSING_HISTORY);
  const needMore = generalOver + historyOver;
  const tooManyMissing = needMore > 0;
  const missingParts: string[] = [];
  if (generalOver) missingParts.push(`${generalOver} câu ở phần thông tin chung (được bỏ qua tối đa ${MAX_MISSING_GENERAL})`);
  if (historyOver) missingParts.push(`${historyOver} câu ở phần tiền sử bệnh (được bỏ qua tối đa ${MAX_MISSING_HISTORY})`);
  const missingMessage = `Cần trả lời thêm ${missingParts.join(" và ")}.`;

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

  function reset() {
    setFeatures(initialFeatures(mode));
    setHeight("");
    setWeight("");
    setPatientName("");
    setPatientCode("");
    setPatientBirthdate("");
    setPatientGender("female");
    setPatientPhone("");
    setSelectedPatientId("");
    setResult(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (features.sex === "" || features.sex === undefined) {
      setError("Vui lòng chọn giới tính.");
      return;
    }
    if (bmi === null) {
      setError("Vui lòng nhập chiều cao và cân nặng hợp lệ để tính BMI.");
      return;
    }
    if (tooManyMissing) {
      setError(missingMessage);
      return;
    }
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
      setResult(await mlService.predict({ mode, target, patient, features: { ...effective, bmi } }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Không thể thực hiện dự đoán, vui lòng thử lại sau.");
    } finally {
      setBusy(false);
    }
  }

  function renderRow(field: FeatureField) {
    const id = `feature-${field.name}`;
    const label = FEATURE_LABELS[field.name];
    const hint = FEATURE_HINTS[field.name];
    const value = effective[field.name] ?? "";
    const lockedNote = locked[field.name];

    if (field.kind === "binary") {
      return (
        <Row key={field.name} label={label} hint={lockedNote ?? hint} control="seg">
          <Segmented label={label} options={[...(field.options ?? []), { value: "", label: "Bỏ qua" }]} value={value}
            disabled={Boolean(lockedNote)} onChange={(next) => setFeature(field.name, next)} />
        </Row>
      );
    }
    if (field.kind === "select") {
      return (
        <Row key={field.name} label={label} hint={hint} labelFor={id} control="select">
          <select id={id} className="dg-input" value={String(value)} onChange={(event) => setFeature(field.name, event.target.value)}>
            <option value="">Chọn hoặc bỏ qua</option>
            {field.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
          </select>
        </Row>
      );
    }
    return (
      <Row key={field.name} label={label} hint={hint} labelFor={id} control="num">
        <div className="dg-unit">
          <input id={id} className="dg-input" type="number" inputMode="numeric" step={field.step} min={field.min} max={field.max}
            placeholder="Ví dụ: 5" value={value} onChange={(event) => setFeature(field.name, event.target.value)} />
          {field.unit && <span>{field.unit}</span>}
        </div>
      </Row>
    );
  }

  const title = target === "self"
    ? "Tự đánh giá nguy cơ"
    : mode === "clinical" ? "Dự đoán cho bệnh nhân – Chế độ lâm sàng" : "Dự đoán cho bệnh nhân – Chế độ phi lâm sàng";

  const visibleGroups = FEATURE_GROUPS.filter((group) => !group.clinicalOnly || mode === "clinical");
  const stepOffset = target === "patient" ? 1 : 0;
  const sexField = FEATURE_FIELDS[mode].find((field) => field.name === "sex");
  const bmiText = bmi !== null ? bmi.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;

  return (
    <div>
      {!hideHeader && (
        <Header title={title} subtitle="Nhập thông tin khảo sát để ước tính kết quả từ mô hình và lưu vào lịch sử." />
      )}
      <div className="dg-stack">
        <div className="dg-notice" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả không phải chẩn đoán.</span>
        </div>
        {error && <div className="dg-notice dg-notice--error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></div>}
        {target === "patient" && patientLoadError && <div className="dg-notice dg-notice--error" role="alert"><CircleAlert aria-hidden="true" /><span>{patientLoadError}</span></div>}

        <form className="dg-sections" onSubmit={(event) => void submit(event)}>
          {target === "patient" && (
            <Section step={1} title="Hồ sơ bệnh nhân" hint="Chọn hồ sơ đã có hoặc nhập bệnh nhân mới.">
              <div className="dg-card dg-card--grid">
                <div className="dg-fields">
                  <Field id="patient-select" label="Hồ sơ đã có">
                    <select id="patient-select" className="dg-input" value={selectedPatientId} onChange={(event) => setSelectedPatientId(event.target.value)}>
                      <option value="">Tạo hồ sơ mới</option>
                      {existingPatients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.patientCode} · {patient.fullName}</option>)}
                    </select>
                  </Field>
                  {!selectedPatientId && <>
                    <Field id="patient-name" label="Họ và tên">
                      <input id="patient-name" className="dg-input" value={patientName} onChange={(event) => setPatientName(event.target.value)} required minLength={2} maxLength={120} />
                    </Field>
                    <Field id="patient-code" label="Mã bệnh nhân (không bắt buộc)">
                      <input id="patient-code" className="dg-input" value={patientCode} onChange={(event) => setPatientCode(event.target.value)} maxLength={40} />
                    </Field>
                    <Field id="patient-birthdate" label="Ngày sinh">
                      <input id="patient-birthdate" className="dg-input" type="date" value={patientBirthdate} onChange={(event) => setPatientBirthdate(event.target.value)} />
                    </Field>
                    <Field label="Giới tính">
                      <Segmented label="Giới tính bệnh nhân" value={patientGender} onChange={(value) => setPatientGender(value as Gender)}
                        options={[{ value: "female", label: "Nữ" }, { value: "male", label: "Nam" }]} />
                    </Field>
                    <Field id="patient-phone" label="Số điện thoại">
                      <input id="patient-phone" className="dg-input" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} />
                    </Field>
                  </>}
                </div>
              </div>
            </Section>
          )}

          {visibleGroups.map((group, index) => (
            <Section key={group.id} step={index + 1 + stepOffset} title={group.title} hint={group.hint}>
              {group.id === "basic" ? (
                <div className="dg-card dg-card--grid">
                  <div className="dg-fields dg-fields--4">
                    <Field id="feature-age" label="Tuổi">
                      <input id="feature-age" className="dg-input" type="number" inputMode="numeric" min={18} max={120} step={1} required
                        placeholder="Ví dụ: 45" value={features.age ?? ""} onChange={(event) => setFeature("age", event.target.value)} />
                    </Field>
                    <Field label="Giới tính">
                      <Segmented label="Giới tính" options={sexField?.options ?? []} value={features.sex ?? ""} onChange={(value) => setFeature("sex", value)} />
                    </Field>
                    <Field id="feature-height" label="Chiều cao">
                      <div className="dg-unit">
                        <input id="feature-height" className="dg-input" type="number" inputMode="decimal" min={100} max={250} step={0.1} required
                          placeholder="Ví dụ: 165" value={height} onChange={(event) => setHeight(event.target.value)} />
                        <span>cm</span>
                      </div>
                    </Field>
                    <Field id="feature-weight" label="Cân nặng">
                      <div className="dg-unit">
                        <input id="feature-weight" className="dg-input" type="number" inputMode="decimal" min={20} max={300} step={0.1} required
                          placeholder="Ví dụ: 60" value={weight} onChange={(event) => setWeight(event.target.value)} />
                        <span>kg</span>
                      </div>
                    </Field>
                  </div>
                  <div className={`dg-bmi dg-bmi--${category.tone}`} aria-live="polite">
                    <div className="dg-bmi-main">
                      <span className="dg-bmi-label">Chỉ số BMI tự động</span>
                      {bmiText && <strong>{bmiText} <small>kg/m²</small></strong>}
                    </div>
                    <span className="dg-bmi-cat">{category.label}</span>
                  </div>
                  {bmiOutOfRange && <p className="dg-field-error" role="alert">BMI tính ra nằm ngoài khoảng 10 – 100 mà mô hình chấp nhận. Vui lòng kiểm tra lại chiều cao và cân nặng.</p>}
                </div>
              ) : (
                <div className="dg-card">
                  {FEATURE_FIELDS[mode].filter((field) => field.group === group.id).map(renderRow)}
                </div>
              )}
            </Section>
          ))}

          <div className="dg-actions">
            <p className={tooManyMissing ? "is-warn" : undefined}>
              {tooManyMissing ? missingMessage : "Đã đủ thông tin để dự đoán."}
            </p>
            <div className="dg-actions-buttons">
              <button type="button" className="dg-btn-secondary" onClick={reset} disabled={busy}>Đặt lại</button>
              <button type="submit" className="dg-submit" disabled={busy || tooManyMissing}>
                {busy ? <Loader2 className="dg-spin" /> : <Activity />}
                {busy ? "Đang xử lý..." : "Dự đoán ngay"}
              </button>
            </div>
          </div>
        </form>

        {result && (
          <section className="dg-panel dg-panel--pad">
            <h2 className="dg-panel-title">Kết quả dự đoán</h2>
            <PredictionResultCard result={result} />
          </section>
        )}
      </div>
    </div>
  );
}