import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, AlertTriangle, CircleAlert, Loader2 } from "lucide-react";
import Header from "../../components/Header";
import { PredictionLoadingView, PredictionResultView } from "../../components/PredictionPresentation";
import { FEATURE_FIELDS, FEATURE_GROUPS, FEATURE_HINTS, FEATURE_LABELS, MAX_MISSING_BY_MODE, type FeatureField, type FeatureOption } from "../../config/features";
import predictionBanner from "../../assets/images/prediction-banner.png";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { Gender, Patient, PatientInfo, PredictionMode, PredictionResult } from "../../types";
import { formatDateOfBirth, localISODate, parseDateOfBirth } from "../../utils/validators";
import "../../dashboard.css";

const REQUIRED = ["age", "sex", "bmi"];

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

function ageFromBirthdate(value: string): number | null {
  const isoDate = parseDateOfBirth(value);
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  const birthdate = new Date(0);
  birthdate.setFullYear(year, month - 1, day);
  if (
    birthdate.getFullYear() !== year
    || birthdate.getMonth() !== month - 1
    || birthdate.getDate() !== day
    || isoDate > localISODate()
  ) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age -= 1;
  return age;
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
            className={on
              ? option.value === ""
                ? option.label === "Bỏ qua" ? "is-on is-skip" : "is-on is-placeholder"
                : "is-on"
              : undefined}
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
  patientDraft?: PatientPredictionDraft;
  onPatientDraftChange?: (draft: PatientPredictionDraft) => void;
}

export interface PatientPredictionDraft {
  features: Record<string, number | string>;
  height: string;
  weight: string;
  patientName: string;
  patientCode: string;
  patientBirthdate: string;
  patientGender: Gender | "";
  patientPhone: string;
  selectedPatientId: string;
}

const emptyPatientDraft = (): PatientPredictionDraft => ({
  features: {},
  height: "",
  weight: "",
  patientName: "",
  patientCode: "",
  patientBirthdate: "",
  patientGender: "",
  patientPhone: "",
  selectedPatientId: "",
});

export default function HealthPredict({
  mode,
  target,
  hideHeader = false,
  patientDraft,
  onPatientDraftChange,
}: HealthPredictProps) {
  const [localDraft, setLocalDraft] = useState<PatientPredictionDraft>(emptyPatientDraft);
  const draft = patientDraft ?? localDraft;
  const features = useMemo(() => ({ ...initialFeatures(mode), ...draft.features }), [mode, draft.features]);
  const height = draft.height;
  const weight = draft.weight;
  const patientName = draft.patientName;
  const patientCode = draft.patientCode;
  const patientBirthdate = draft.patientBirthdate;
  const patientGender = draft.patientGender;
  const patientPhone = draft.patientPhone;
  const selectedPatientId = draft.selectedPatientId;
  const [existingPatients, setExistingPatients] = useState<Patient[]>([]);
  const [patientLoadError, setPatientLoadError] = useState("");
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateDraft(patch: Partial<PatientPredictionDraft>) {
    const next = { ...draft, ...patch };
    setLocalDraft(next);
    onPatientDraftChange?.(next);
  }

  useEffect(() => {
    if (target === "self") {
      setLocalDraft((previous) => ({ ...previous, features: initialFeatures(mode) }));
    }
    setResult(null);
  }, [mode, target]);

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
  const age = ageFromBirthdate(patientBirthdate);
  const ageInModelRange = age !== null && age >= 18 && age <= 120;
  const selectedPatient = existingPatients.find((patient) => patient.patientId === selectedPatientId);

  const effective = useMemo(() => applyRules(mode, features), [mode, features]);
  const locked = useMemo(() => lockedFields(mode, features), [mode, features]);
  const isBlank = (field: FeatureField) => effective[field.name] === "" || effective[field.name] === undefined;
  const optionalFields = FEATURE_FIELDS[mode].filter((field) => !REQUIRED.includes(field.name));
  const missingOptional = optionalFields.filter(isBlank).length;
  const maxMissing = MAX_MISSING_BY_MODE[mode];
  const tooManyMissing = missingOptional > maxMissing;
  const missingToAnswer = Math.max(0, missingOptional - maxMissing);
  const missingMessage = `Bạn đang bỏ trống ${missingOptional} câu. Ở chế độ này, bạn chỉ được bỏ trống tối đa ${maxMissing} câu. Vui lòng trả lời thêm ít nhất ${missingToAnswer} câu để tiếp tục.`;

  function setFeature(name: string, value: string) {
    const field = FEATURE_FIELDS[mode].find((item) => item.name === name);
    if (!field) return;
    if (field.kind === "number") {
      updateDraft({ features: { ...features, [name]: value === "" ? "" : Number(value) } });
      return;
    }
    const selected = field.options?.find((option) => String(option.value) === value)?.value ?? value;
    updateDraft({ features: { ...features, [name]: selected } });
  }

  function reset() {
    updateDraft({
      features: initialFeatures(mode),
      height: "",
      weight: "",
      patientName: "",
      patientCode: "",
      patientBirthdate: "",
      patientGender: "",
      patientPhone: "",
      selectedPatientId: "",
    });
    setResult(null);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    if (age === null) {
      setError("Vui lòng nhập ngày sinh hợp lệ để hệ thống tự tính tuổi.");
      return;
    }
    if (!ageInModelRange) {
      setError("Tuổi tính từ ngày sinh phải nằm trong khoảng 18 – 120 tuổi.");
      return;
    }
    const modelSex = target === "patient"
      ? patientGender === "male" ? "Male" : patientGender === "female" ? "Female" : ""
      : features.sex;
    if (modelSex === "" || modelSex === undefined) {
      setError("Vui lòng chọn giới tính Nam hoặc Nữ trước khi tiếp tục.");
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
    const patientBirthdateIso = parseDateOfBirth(patientBirthdate);
    const patient: PatientInfo | { patientId: string } | undefined = target !== "patient"
      ? undefined
      : selectedPatientId
        ? { patientId: selectedPatientId }
        : {
          fullName: patientName.trim(),
          ...(patientCode.trim() ? { patientCode: patientCode.trim() } : {}),
          ...(patientBirthdateIso ? { birthdate: patientBirthdateIso } : {}),
          ...(patientGender ? { gender: patientGender } : {}),
          ...(patientPhone.trim() ? { phone: patientPhone.trim() } : {}),
        };
    if (target === "patient" && !selectedPatientId && patientName.trim().length < 2) {
      setError("Vui lòng chọn hồ sơ bệnh nhân hoặc nhập họ tên hợp lệ.");
      return;
    }

    setBusy(true);
    try {
      setResult(await mlService.predict({
        mode,
        target,
        patient,
        features: { ...effective, age, sex: modelSex, bmi },
      }));
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
  const pageTitle = busy
    ? "Đang dự đoán..."
    : result ? "Kết quả phân tích nguy cơ đái tháo đường" : title;
  const pageSubtitle = busy
    ? "Mô hình đang xử lý thông tin khảo sát."
    : result ? "Kết quả sàng lọc dựa trên dữ liệu đã cung cấp." : "Nhập thông tin khảo sát để ước tính kết quả từ mô hình và lưu vào lịch sử.";

  const visibleGroups = FEATURE_GROUPS.filter((group) => !group.clinicalOnly || mode === "clinical");
  const stepOffset = target === "patient" ? 1 : 0;
  const sexField = FEATURE_FIELDS[mode].find((field) => field.name === "sex");
  const bmiText = bmi !== null ? bmi.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;

  return (
    <div>
      {!hideHeader && (
        <Header title={pageTitle} subtitle={pageSubtitle} />
      )}
      <div className="dg-stack">
        {busy ? (
          <PredictionLoadingView mode={mode} />
        ) : result ? (
          <PredictionResultView result={result} onReset={() => setResult(null)} />
        ) : (
          <>
            <section className="dg-predict-hero" aria-label="Minh họa đánh giá sức khỏe">
              <img
                className="dg-predict-hero-image"
                src={predictionBanner}
                alt="Bác sĩ tư vấn bệnh nhân cùng hình minh họa robot DiaRisk VN"
              />
            </section>
            <div className="dg-predict-disclaimer" role="note">
              <AlertTriangle aria-hidden="true" />
              <span><strong>Lưu ý về giới hạn mô hình:</strong> Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo, chưa được kiểm định lâm sàng tại Việt Nam. Kết quả chỉ mang tính tham khảo, không phải chẩn đoán thay thế cho bác sĩ.</span>
            </div>
            {error && <div className="dg-notice dg-notice--error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span></div>}
            {target === "patient" && patientLoadError && <div className="dg-notice dg-notice--error" role="alert"><CircleAlert aria-hidden="true" /><span>{patientLoadError}</span></div>}

            <form className="dg-sections" onSubmit={(event) => void submit(event)}>
          {target === "patient" && (
            <Section step={1} title="Hồ sơ bệnh nhân" hint="Chọn hồ sơ đã có hoặc nhập bệnh nhân mới.">
              <div className="dg-card dg-card--grid">
                <div className="dg-fields">
                  <Field id="patient-select" label="Hồ sơ đã có">
                    <select id="patient-select" className="dg-input" value={selectedPatientId} onChange={(event) => {
                      const patientId = event.target.value;
                      const patient = existingPatients.find((item) => item.patientId === patientId);
                      updateDraft({
                        selectedPatientId: patientId,
                        patientName: patient?.fullName ?? "",
                        patientCode: patient?.patientCode ?? "",
                        patientBirthdate: formatDateOfBirth(patient?.birthdate),
                        patientGender: patient?.gender ?? "",
                        patientPhone: patient?.phone ?? "",
                      });
                    }}>
                      <option value="">Tạo hồ sơ mới</option>
                      {existingPatients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.patientCode} · {patient.fullName}</option>)}
                    </select>
                  </Field>
                  {!selectedPatientId ? <>
                    <Field id="patient-name" label="Họ và tên">
                      <input id="patient-name" className="dg-input" value={patientName} onChange={(event) => updateDraft({ patientName: event.target.value })} required minLength={2} maxLength={120} />
                    </Field>
                    <Field id="patient-code" label="Mã bệnh nhân (không bắt buộc)">
                      <input id="patient-code" className="dg-input" value={patientCode} onChange={(event) => updateDraft({ patientCode: event.target.value })}
                        placeholder="Ví dụ: BN-001" maxLength={40} />
                    </Field>
                    <Field id="patient-birthdate" label="Ngày sinh">
                      <input id="patient-birthdate" className="dg-input" type="text" inputMode="numeric" maxLength={10}
                        placeholder="dd/mm/yyyy" value={patientBirthdate}
                        onChange={(event) => updateDraft({ patientBirthdate: event.target.value })} required />
                    </Field>
                    <Field label="Giới tính">
                      <Segmented label="Giới tính bệnh nhân" value={patientGender} onChange={(value) => updateDraft({ patientGender: value as Gender })}
                        options={[{ value: "male", label: "Nam" }, { value: "female", label: "Nữ" }]} />
                    </Field>
                    <Field id="patient-phone" label="Số điện thoại">
                      <input id="patient-phone" className="dg-input" value={patientPhone} onChange={(event) => updateDraft({ patientPhone: event.target.value })} />
                    </Field>
                  </> : (
                    <div className="dg-patient-summary">
                      <div><span>Họ tên</span><strong>{selectedPatient?.fullName ?? patientName}</strong></div>
                      <div><span>Ngày sinh</span><strong>{patientBirthdate || "Chưa có"}</strong></div>
                      <div><span>Giới tính</span><strong>{patientGender === "female" ? "Nữ" : patientGender === "male" ? "Nam" : "Chưa có"}</strong></div>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {visibleGroups.map((group, index) => (
            <Section key={group.id} step={index + 1 + stepOffset} title={group.title} hint={group.hint}>
              {group.id === "basic" ? (
                <div className="dg-card dg-card--grid">
                  <div className="dg-fields dg-fields--4">
                    {target === "self" && (
                      <Field id="self-birthdate" label="Ngày sinh">
                        <input id="self-birthdate" className="dg-input" type="text" inputMode="numeric" maxLength={10}
                        placeholder="dd/mm/yyyy" value={patientBirthdate}
                        onChange={(event) => updateDraft({ patientBirthdate: event.target.value })} required />
                      </Field>
                    )}
                    <Field id="feature-age" label="Tuổi (tự động)">
                      <input id="feature-age" className="dg-input" type="text" inputMode="numeric" readOnly aria-readonly="true"
                        value={age ?? ""} placeholder="Nhập ngày sinh để tính" />
                    </Field>
                    {target === "self" && (
                      <Field label="Giới tính">
                        <Segmented label="Giới tính" options={sexField?.options ?? []} value={features.sex ?? ""} onChange={(value) => setFeature("sex", value)} />
                      </Field>
                    )}
                    <Field id="feature-height" label="Chiều cao">
                      <div className="dg-unit">
                        <input id="feature-height" className="dg-input" type="number" inputMode="decimal" min={100} max={250} step={0.1} required
                          placeholder="Ví dụ: 165" value={height} onChange={(event) => updateDraft({ height: event.target.value })} />
                        <span>cm</span>
                      </div>
                    </Field>
                    <Field id="feature-weight" label="Cân nặng">
                      <div className="dg-unit">
                        <input id="feature-weight" className="dg-input" type="number" inputMode="decimal" min={20} max={300} step={0.1} required
                          placeholder="Ví dụ: 60" value={weight} onChange={(event) => updateDraft({ weight: event.target.value })} />
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
            {tooManyMissing && <div className="dg-notice dg-notice--warning" role="alert">
              <AlertTriangle aria-hidden="true" /><span>{missingMessage}</span>
            </div>}
            <div className="dg-actions-buttons">
              <button type="button" className="dg-btn-secondary" onClick={reset} disabled={busy}>Đặt lại</button>
              <button type="submit" className="dg-submit" disabled={busy || tooManyMissing}>
                {busy ? <Loader2 className="dg-spin" /> : <Activity />}
                {busy ? "Đang xử lý..." : "Dự đoán ngay"}
              </button>
            </div>
          </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}