import type { PredictionMode } from "../types";

export const FEATURE_LABELS: Record<string, string> = {
  age: "Tuổi",
  age_group: "Nhóm tuổi",
  sex: "Giới tính",
  bmi: "BMI",
  smoker_status: "Tình trạng hút thuốc",
  physical_activity: "Hoạt động thể lực",
  fruits_daily: "Ăn trái cây hằng ngày",
  veggies_daily: "Ăn rau hằng ngày",
  heavy_alcohol: "Sử dụng rượu bia nhiều",
  gen_health: "Tự đánh giá sức khỏe (1 tốt nhất, 5 kém nhất)",
  ment_hlth_days: "Số ngày sức khỏe tinh thần không tốt",
  phys_hlth_days: "Số ngày sức khỏe thể chất không tốt",
  diff_walk: "Khó khăn khi đi bộ hoặc leo cầu thang",
  education: "Trình độ học vấn (mã BRFSS 1–6)",
  income: "Nhóm thu nhập (mã BRFSS 1–8)",
  any_healthcare: "Có bảo hiểm/chăm sóc y tế",
  no_doc_cost: "Không đi khám do chi phí",
  high_bp: "Được chẩn đoán tăng huyết áp",
  bp_meds: "Đang dùng thuốc huyết áp",
  high_chol: "Được chẩn đoán cholesterol cao",
  chol_check: "Đã kiểm tra cholesterol",
  stroke: "Tiền sử đột quỵ",
  heart_disease: "Tiền sử bệnh tim mạch vành",
  heart_attack: "Tiền sử nhồi máu cơ tim",
  kidney_disease: "Tiền sử bệnh thận",
  depressive_disorder: "Được chẩn đoán trầm cảm",
  asthma: "Tiền sử hen suyễn",
  arthritis: "Tiền sử viêm khớp",
  copd: "Tiền sử COPD",
  last_checkup: "Thời gian từ lần khám sức khỏe gần nhất (mã BRFSS 1–5)",
};

export type FeatureOption = { value: string | number; label: string };
export type FeatureField = {
  name: string;
  kind: "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number;
  options?: FeatureOption[];
};

const yesNo = [
  { value: 0, label: "Không" },
  { value: 1, label: "Có" },
];

const commonFields: FeatureField[] = [
  { name: "age", kind: "number", min: 18, max: 120, step: 1, defaultValue: 45 },
  {
    name: "sex",
    kind: "select",
    defaultValue: "Female",
    options: [
      { value: "Male", label: "Nam" },
      { value: "Female", label: "Nữ" },
    ],
  },
  { name: "bmi", kind: "number", min: 10, max: 100, step: 0.1, defaultValue: 25 },
  {
    name: "smoker_status",
    kind: "select",
    options: [
      { value: "current", label: "Đang hút thuốc" },
      { value: "former", label: "Đã từng hút thuốc" },
      { value: "never", label: "Chưa từng hút thuốc" },
    ],
  },
  { name: "physical_activity", kind: "select", options: yesNo },
  { name: "fruits_daily", kind: "select", options: yesNo },
  { name: "veggies_daily", kind: "select", options: yesNo },
  { name: "heavy_alcohol", kind: "select", options: yesNo },
  { name: "gen_health", kind: "number", min: 1, max: 5, step: 1 },
  { name: "ment_hlth_days", kind: "number", min: 0, max: 30, step: 1 },
  { name: "phys_hlth_days", kind: "number", min: 0, max: 30, step: 1 },
  { name: "diff_walk", kind: "select", options: yesNo },
  { name: "education", kind: "number", min: 1, max: 6, step: 1 },
  { name: "income", kind: "number", min: 1, max: 8, step: 1 },
  { name: "any_healthcare", kind: "select", options: yesNo },
  { name: "no_doc_cost", kind: "select", options: yesNo },
];

const clinicalFields: FeatureField[] = [
  { name: "high_bp", kind: "select", options: yesNo },
  { name: "bp_meds", kind: "select", options: yesNo },
  { name: "high_chol", kind: "select", options: yesNo },
  { name: "chol_check", kind: "select", options: yesNo },
  { name: "stroke", kind: "select", options: yesNo },
  { name: "heart_disease", kind: "select", options: yesNo },
  { name: "heart_attack", kind: "select", options: yesNo },
  { name: "kidney_disease", kind: "select", options: yesNo },
  { name: "depressive_disorder", kind: "select", options: yesNo },
  { name: "asthma", kind: "select", options: yesNo },
  { name: "arthritis", kind: "select", options: yesNo },
  { name: "copd", kind: "select", options: yesNo },
  { name: "last_checkup", kind: "number", min: 1, max: 5, step: 1 },
];

export const FEATURE_FIELDS: Record<PredictionMode, FeatureField[]> = {
  nonclinical: commonFields,
  clinical: [...commonFields, ...clinicalFields],
};

export function allowedFeatureNames(mode: PredictionMode): string[] {
  return FEATURE_FIELDS[mode].map((field) => field.name);
}
