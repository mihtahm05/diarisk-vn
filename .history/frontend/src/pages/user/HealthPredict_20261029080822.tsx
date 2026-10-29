import { useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, Loader2, PlusCircle, TriangleAlert } from "lucide-react";
import Header from "../../components/Header";
import PredictionResultCard from "../../components/PredictionResultCard";
import { Field, Notice, SelectField, TextField, focusFirstError } from "../../components/FormControls";
import { useAuth } from "../../context/AuthContext";
import { ageToGroup, bmiCategory, calcBmi, fieldsFor, SEX_CODE, type FeatureField } from "../../config/features";
import { ApiError } from "../../services/api";
import { mlService } from "../../services/mlService";
import type { ApiFieldErrors, Gender, PredictionMode, PredictionResult } from "../../types";

interface Props {
  mode: PredictionMode;
  /** self: tự đánh giá cho bản thân; patient: cán bộ y tế dự đoán cho bệnh nhân */
  target: "self" | "patient";
  title?: string;
  subtitle?: string;
}

function ageFromBirthdate(iso?: string): string {
  if (!iso) return "";
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age >= 18 && age <= 100 ? String(age) : "";
}

function SectionCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-100 text-sm text-brand-700">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function HealthPredict({ mode, target, title, subtitle }: Props) {
  const { user } = useAuth();
  const selfPrefill = target === "self";
  const [age, setAge] = useState(selfPrefill ? ageFromBirthdate(user?.birthdate) : "");
  const [sex, setSex] = useState<Gender | "">(selfPrefill ? user?.gender ?? "" : "");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [patient, setPatient] = useState({ fullName: "", phone: "", address: "", birthdate: "" });
  const [errors, setErrors] = useState<ApiFieldErrors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const submitting = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const fields = useMemo(() => fieldsFor(mode), [mode]);
  const history = fields.filter((f) => f.group === "history");
  const lifestyle = fields.filter((f) => f.group === "lifestyle");

  const bmi = calcBmi(Number(height), Number(weight));
  const bmiInfo = bmi ? bmiCategory(bmi) : null;

  const setVal = (name: string, v: string) => {
    setVals((s) => ({ ...s, [name]: v }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  };
  const clearErr = (k: string) => errors[k] && setErrors((e) => ({ ...e, [k]: "" }));

  function validate(): ApiFieldErrors {
    const e: ApiFieldErrors = {};
    if (target === "patient" && patient.fullName.trim().length < 2) e.patientName = "Vui lòng nhập họ tên bệnh nhân";
    const a = Number(age);
    if (!age) e.age = "Vui lòng nhập tuổi";
    else if (!Number.isInteger(a) || a < 18 || a > 100) e.age = "Tuổi phải từ 18 đến 100";
    if (!sex) e.sex = "Vui lòng chọn giới tính";
    const h = Number(height);
    if (!height) e.height = "Vui lòng nhập chiều cao";
    else if (!(h >= 50 && h <= 250)) e.height = "Chiều cao từ 50 đến 250 cm";
    const w = Number(weight);
    if (!weight) e.weight = "Vui lòng nhập cân nặng";
    else if (!(w >= 10 && w <= 300)) e.weight = "Cân nặng từ 10 đến 300 kg";
    for (const f of fields) {
      const v = vals[f.name];
      if (v === undefined || v === "") { e[f.name] = f.kind === "select" ? "Vui lòng chọn" : "Vui lòng nhập"; continue; }
      if (f.kind === "number") {
        const n = Number(v);
        if (!Number.isInteger(n) || n < (f.min ?? 0) || n > (f.max ?? 999)) e[f.name] = `Giá trị từ ${f.min} đến ${f.max}`;
      }
    }
    return e;
  }

  const orderIds = [
    "pt-name", "f-age", "f-sex-male", "f-height", "f-weight", ...fields.map((f) => `f-${f.name}`),
  ];
  const idForKey = (k: string) => (k === "patientName" ? "pt-name" : k === "age" ? "f-age" : k === "sex" ? "f-sex-male" : k === "height" ? "f-height" : k === "weight" ? "f-weight" : `f-${k}`);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (submitting.current) return;
    setFormError("");
    setResult(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const keys = Object.keys(e).map(idForKey);
      focusFirstError(orderIds.filter((id) => keys.includes(id)));
      return;
    }
    const group = ageToGroup(Number(age));
    if (!group || !bmi || !sex) return;

    const features: Record<string, number> = {
      age_group: group,
      sex: SEX_CODE[sex],
      bmi: Math.round(bmi * 100) / 100,
    };
    for (const f of fields) features[f.name] = Number(vals[f.name]);

    submitting.current = true;
    setLoading(true);
    try {
      const res = await mlService.predict({
        mode,
        target,
        patient: target === "patient"
          ? { fullName: patient.fullName.trim(), phone: patient.phone.trim() || undefined, address: patient.address.trim() || undefined, birthdate: patient.birthdate || undefined, gender: sex }
          : undefined,
        features,
      });
      setResult(res);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setFormError(err.status >= 500 || err.status === 0 ? "Không thể thực hiện dự đoán, vui lòng thử lại sau" : err.message);
      } else setFormError("Không thể thực hiện dự đoán, vui lòng thử lại sau");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  const renderField = (f: FeatureField) =>
    f.kind === "select" ? (
      <SelectField key={f.name} id={`f-${f.name}`} label={f.label} hint={f.help} value={vals[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)} error={errors[f.name]}>
        <option value="">-- Chọn --</option>
        {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </SelectField>
    ) : (
      <TextField key={f.name} id={`f-${f.name}`} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} type="number" inputMode="numeric" min={f.min} max={f.max}
        value={vals[f.name] ?? ""} onChange={(e) => setVal(f.name, e.target.value)} error={errors[f.name]} />
    );

  const defaultTitle =
    target === "patient"
      ? `Dự đoán cho bệnh nhân – Chế độ ${mode === "clinical" ? "lâm sàng" : "phi lâm sàng"}`
      : "Dự đoán nguy cơ cá nhân";
  let n = 0;

  return (
    <div>
      <Header title={title ?? defaultTitle} subtitle={subtitle ?? "Nhập thông tin sức khỏe để phân tích nguy cơ đái tháo đường"} />

      {/* Banner minh hoạ + lưu ý */}
      <div className="relative mb-4 overflow-hidden rounded-xl bg-gradient-to-r from-[#cfe4fa] via-[#e3f0fc] to-[#c6dcf7]">
        <div className="flex h-36 items-center justify-center gap-6 sm:h-44" aria-hidden>
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#5bc6e8] bg-white/80 shadow-lg sm:h-28 sm:w-28">
            <Bot className="h-12 w-12 text-[#3a9be6] sm:h-14 sm:w-14" />
          </div>
        </div>
        <p className="mx-3 mb-3 flex items-start gap-2 rounded-md bg-[#5b7fe0] px-3 py-2 text-xs text-white sm:text-[13px]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-200" aria-hidden />
          <span><b>Lưu ý:</b> DiaRisk VN chỉ cung cấp thông tin tham khảo, không thể chẩn đoán và chỉ định chính thức của bác sĩ chuyên môn.</span>
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Notice tone="error">{formError}</Notice>}

        {target === "patient" && (
          <SectionCard n={++n} title="Thông tin bệnh nhân">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField id="pt-name" label="Họ và tên bệnh nhân" value={patient.fullName} error={errors.patientName}
                onChange={(e) => { setPatient({ ...patient, fullName: e.target.value }); clearErr("patientName"); }} />
              <TextField id="pt-phone" label="Số điện thoại (không bắt buộc)" value={patient.phone} onChange={(e) => setPatient({ ...patient, phone: e.target.value })} />
              <TextField id="pt-birth" label="Ngày sinh (không bắt buộc)" type="date" max={new Date().toISOString().slice(0, 10)} value={patient.birthdate} onChange={(e) => setPatient({ ...patient, birthdate: e.target.value })} />
              <TextField id="pt-address" label="Địa chỉ (không bắt buộc)" value={patient.address} onChange={(e) => setPatient({ ...patient, address: e.target.value })} />
            </div>
          </SectionCard>
        )}

        <SectionCard n={++n} title="Thông tin cơ bản">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <TextField id="f-age" label="Tuổi (18-100)" type="number" inputMode="numeric" min={18} max={100} value={age} onChange={(e) => { setAge(e.target.value); clearErr("age"); }} error={errors.age} />
            <Field id="f-sex-male" label="Giới tính" error={errors.sex}>
              <div role="radiogroup" aria-label="Giới tính" className="flex h-10 items-center gap-5 text-sm">
                {([["male", "Nam"], ["female", "Nữ"]] as const).map(([v, l]) => (
                  <label key={v} className="flex cursor-pointer items-center gap-1.5">
                    <input id={v === "male" ? "f-sex-male" : "f-sex-female"} type="radio" name="sex" checked={sex === v} onChange={() => { setSex(v); clearErr("sex"); }} className="h-4 w-4 accent-brand-600" />
                    {l}
                  </label>
                ))}
              </div>
            </Field>
            <TextField id="f-height" label="Chiều cao (Cm)" type="number" inputMode="decimal" min={50} max={250} value={height} onChange={(e) => { setHeight(e.target.value); clearErr("height"); }} error={errors.height} />
            <TextField id="f-weight" label="Cân nặng (Kg)" type="number" inputMode="decimal" min={10} max={300} value={weight} onChange={(e) => { setWeight(e.target.value); clearErr("weight"); }} error={errors.weight} />
          </div>

          <div
            className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 ${
              !bmiInfo ? "border-slate-200 bg-slate-50 text-slate-500"
                : bmiInfo.tone === "ok" ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : bmiInfo.tone === "warn" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-red-400 bg-red-50 text-red-700"
            }`}
            aria-live="polite"
          >
            <div className="flex items-center gap-3">
              <PlusCircle className="h-6 w-6 shrink-0" aria-hidden />
              <div>
                <p className="text-sm font-bold">
                  Chỉ số BMI tự động: {bmi ? <>{bmi.toFixed(2)} kg/m<sup>2</sup></> : "—"}
                </p>
                <p className="text-xs opacity-80">{bmiInfo ? "Phân loại theo ngưỡng BMI của WHO" : "Nhập chiều cao và cân nặng để tính BMI"}</p>
              </div>
            </div>
            {bmiInfo && <span className="rounded-md bg-white/70 px-3 py-1 text-xs font-semibold">{bmiInfo.label}</span>}
          </div>
        </SectionCard>

        <SectionCard n={++n} title="Tiền sử & sức khỏe">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{history.map(renderField)}</div>
        </SectionCard>

        <SectionCard n={++n} title="Lối sống & thói quen">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{lifestyle.map(renderField)}</div>
        </SectionCard>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary min-w-[160px] py-3" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Đang phân tích..." : "Dự đoán ngay"}
          </button>
        </div>
      </form>

      {result && (
        <div ref={resultRef} className="panel mt-6" aria-live="polite">
          <h2 className="mb-4 text-base font-bold text-slate-800">Kết quả dự đoán</h2>
          <PredictionResultCard result={result} />
        </div>
      )}
    </div>
  );
}
