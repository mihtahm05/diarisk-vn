import type { PredictionMode } from "../types";

/** Nhãn hiển thị (form và phần "Chỉ số đầu vào" của kết quả). */
export const FEATURE_LABELS: Record<string, string> = {
  age: "Tuổi",
  age_group: "Nhóm tuổi",
  sex: "Giới tính",
  bmi: "BMI",
  smoker_status: "Tình trạng hút thuốc",
  physical_activity: "Hoạt động thể lực (30 ngày qua)",
  fruits_daily: "Ăn trái cây hằng ngày",
  veggies_daily: "Ăn rau hằng ngày",
  heavy_alcohol: "Uống nhiều rượu bia",
  gen_health: "Tự đánh giá sức khỏe chung",
  ment_hlth_days: "Số ngày sức khỏe tinh thần không tốt",
  phys_hlth_days: "Số ngày sức khỏe thể chất không tốt",
  diff_walk: "Khó đi bộ hoặc leo cầu thang",
  education: "Trình độ học vấn",
  income: "Nhóm thu nhập hộ gia đình",
  any_healthcare: "Có bảo hiểm / chăm sóc y tế",
  no_doc_cost: "Không đi khám vì chi phí (12 tháng)",
  high_bp: "Được chẩn đoán tăng huyết áp",
  bp_meds: "Đang dùng thuốc huyết áp",
  high_chol: "Được chẩn đoán cholesterol cao",
  chol_check: "Đã kiểm tra cholesterol (5 năm)",
  stroke: "Tiền sử đột quỵ",
  heart_disease: "Bệnh tim mạch vành hoặc nhồi máu cơ tim",
  heart_attack: "Tiền sử nhồi máu cơ tim",
  kidney_disease: "Tiền sử bệnh thận",
  depressive_disorder: "Được chẩn đoán trầm cảm",
  asthma: "Tiền sử hen suyễn",
  arthritis: "Tiền sử viêm khớp",
  copd: "Tiền sử COPD (phổi tắc nghẽn)",
  last_checkup: "Lần khám sức khỏe gần nhất",
};

/** Mô tả phụ hiển thị dưới tên chỉ số (viết theo định nghĩa của khảo sát BRFSS). */
export const FEATURE_HINTS: Record<string, string> = {
  smoker_status: "Hiện tại hoặc trước đây",
  physical_activity: "Ngoài công việc, trong 30 ngày qua",
  fruits_daily: "Từ 1 lần mỗi ngày trở lên",
  veggies_daily: "Từ 1 lần mỗi ngày trở lên",
  heavy_alcohol: "Nam trên 14 ly/tuần, nữ trên 7 ly/tuần",
  gen_health: "Đánh giá chung của chính bạn",
  ment_hlth_days: "Trong 30 ngày qua, gồm căng thẳng, trầm cảm, cảm xúc (0 – 30 ngày)",
  phys_hlth_days: "Trong 30 ngày qua, gồm bệnh và chấn thương (0 – 30 ngày)",
  diff_walk: "Gặp khó khăn nghiêm trọng khi đi bộ hoặc leo cầu thang",
  education: "Bậc học cao nhất đã hoàn thành",
  income: "Tổng thu nhập hộ gia đình mỗi năm, tính theo USD",
  any_healthcare: "Bảo hiểm y tế hoặc chương trình chăm sóc sức khỏe",
  no_doc_cost: "Cần khám nhưng không đi vì chi phí",
  high_bp: "Đã được bác sĩ chẩn đoán",
  bp_meds: "Đang dùng thuốc điều trị; chỉ áp dụng khi có huyết áp cao",
  high_chol: "Đã được bác sĩ chẩn đoán; chưa từng đo cholesterol thì chọn Bỏ qua",
  chol_check: "Trong vòng 5 năm qua",
  stroke: "Đã được bác sĩ chẩn đoán",
  heart_disease: "Đã được bác sĩ chẩn đoán, gồm cả trường hợp từng nhồi máu cơ tim",
  heart_attack: "Đã được bác sĩ chẩn đoán",
  kidney_disease: "Không gồm sỏi thận, nhiễm trùng bàng quang",
  depressive_disorder: "Đã được bác sĩ chẩn đoán",
  asthma: "Đã từng được chẩn đoán",
  arthritis: "Đã được bác sĩ chẩn đoán",
  copd: "Gồm khí phế thũng, viêm phế quản mạn",
  last_checkup: "Lần kiểm tra sức khỏe tổng quát với bác sĩ",
};

export type FeatureOption = { value: string | number; label: string };

export type FeatureGroup = "basic" | "lifestyle" | "general" | "social" | "history";

export type FeatureField = {
  name: string;
  /** number: ô số · select: danh sách chọn · binary: nút Có / Không / Không rõ */
  kind: "number" | "select" | "binary";
  group: FeatureGroup;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: string | number;
  options?: FeatureOption[];
};

export const FEATURE_GROUPS: { id: FeatureGroup; title: string; hint: string; clinicalOnly?: boolean }[] = [
  { id: "basic", title: "Thông tin cơ bản", hint: "Bắt buộc nhập tuổi, giới tính, chiều cao và cân nặng. BMI được tính tự động." },
  { id: "lifestyle", title: "Lối sống và thói quen", hint: "Thói quen gần đây của bạn. Câu nào chưa rõ thì chọn Bỏ qua." },
  { id: "general", title: "Tình trạng sức khỏe chung", hint: "Cảm nhận về sức khỏe của bạn trong 30 ngày qua." },
  { id: "social", title: "Học vấn, thu nhập và tiếp cận y tế", hint: "Điều kiện sống và khả năng đi khám của bạn." },
  { id: "history", title: "Tiền sử bệnh và khám sức khỏe", hint: "Chỉ ghi các chẩn đoán đã được bác sĩ xác nhận. Mô hình không nhận chỉ số xét nghiệm.", clinicalOnly: true },
];

const yesNo: FeatureOption[] = [
  { value: 1, label: "Có" },
  { value: 0, label: "Không" },
];

const commonFields: FeatureField[] = [
  // Nhóm "basic": age, sex nhập trực tiếp; bmi do form tự tính từ chiều cao và cân nặng.
  { name: "age", kind: "number", group: "basic", min: 18, max: 120, step: 1 },
  {
    name: "sex", kind: "select", group: "basic",
    options: [{ value: "Male", label: "Nam" }, { value: "Female", label: "Nữ" }],
  },
  { name: "bmi", kind: "number", group: "basic", min: 10, max: 100, step: 0.1 },

  {
    name: "smoker_status", kind: "select", group: "lifestyle",
    options: [
      { value: "current", label: "Đang hút thuốc" },
      { value: "former", label: "Đã từng hút, hiện đã bỏ" },
      { value: "never", label: "Chưa từng hút thuốc" },
    ],
  },
  { name: "physical_activity", kind: "binary", group: "lifestyle", options: yesNo },
  { name: "fruits_daily", kind: "binary", group: "lifestyle", options: yesNo },
  { name: "veggies_daily", kind: "binary", group: "lifestyle", options: yesNo },
  { name: "heavy_alcohol", kind: "binary", group: "lifestyle", options: yesNo },

  {
    name: "gen_health", kind: "select", group: "general",
    options: [
      { value: 1, label: "1 – Rất tốt" },
      { value: 2, label: "2 – Tốt" },
      { value: 3, label: "3 – Khá" },
      { value: 4, label: "4 – Yếu" },
      { value: 5, label: "5 – Kém" },
    ],
  },
  { name: "ment_hlth_days", kind: "number", group: "general", min: 0, max: 30, step: 1, unit: "ngày" },
  { name: "phys_hlth_days", kind: "number", group: "general", min: 0, max: 30, step: 1, unit: "ngày" },
  { name: "diff_walk", kind: "binary", group: "general", options: yesNo },

  {
    name: "education", kind: "select", group: "social",
    options: [
  { value: 1, label: "Chưa đi học hoặc chỉ học mẫu giáo" },
  { value: 2, label: "Tiểu học đến THCS (lớp 1–9)" },
  { value: 3, label: "Một phần THPT (lớp 10–11)" },
  { value: 4, label: "Tốt nghiệp THPT" },
  { value: 5, label: "Một phần cao đẳng / trung cấp" },
  { value: 6, label: "Tốt nghiệp đại học trở lên" },
],
  },
  {
    name: "income", kind: "select", group: "social",
    options: [
      { value: 1, label: "Nhóm 1 – thấp nhất (dưới 10.000 USD/năm)" },
      { value: 2, label: "Nhóm 2 (10.000 – 15.000 USD/năm)" },
      { value: 3, label: "Nhóm 3 (15.000 – 20.000 USD/năm)" },
      { value: 4, label: "Nhóm 4 (20.000 – 25.000 USD/năm)" },
      { value: 5, label: "Nhóm 5 (25.000 – 35.000 USD/năm)" },
      { value: 6, label: "Nhóm 6 (35.000 – 50.000 USD/năm)" },
      { value: 7, label: "Nhóm 7 (50.000 – 75.000 USD/năm)" },
      { value: 8, label: "Nhóm 8 – cao nhất (từ 75.000 USD/năm)" },
    ],
  },
  { name: "any_healthcare", kind: "binary", group: "social", options: yesNo },
  { name: "no_doc_cost", kind: "binary", group: "social", options: yesNo },
];

const clinicalFields: FeatureField[] = [
  { name: "high_bp", kind: "binary", group: "history", options: yesNo },
  { name: "bp_meds", kind: "binary", group: "history", options: yesNo },
  { name: "high_chol", kind: "binary", group: "history", options: yesNo },
  { name: "chol_check", kind: "binary", group: "history", options: yesNo },
  { name: "stroke", kind: "binary", group: "history", options: yesNo },
  { name: "heart_disease", kind: "binary", group: "history", options: yesNo },
  { name: "heart_attack", kind: "binary", group: "history", options: yesNo },
  { name: "kidney_disease", kind: "binary", group: "history", options: yesNo },
  { name: "depressive_disorder", kind: "binary", group: "history", options: yesNo },
  { name: "asthma", kind: "binary", group: "history", options: yesNo },
  { name: "arthritis", kind: "binary", group: "history", options: yesNo },
  { name: "copd", kind: "binary", group: "history", options: yesNo },
  {
    name: "last_checkup", kind: "select", group: "history",
    options: [
      { value: 1, label: "Trong vòng 1 năm" },
      { value: 2, label: "1 – 2 năm trước" },
      { value: 3, label: "2 – 5 năm trước" },
      { value: 4, label: "Từ 5 năm trở lên" },
      { value: 5, label: "Chưa từng khám" },
    ],
  },
];

export const FEATURE_FIELDS: Record<PredictionMode, FeatureField[]> = {
  nonclinical: commonFields,
  clinical: [...commonFields, ...clinicalFields],
};

export function allowedFeatureNames(mode: PredictionMode): string[] {
  return FEATURE_FIELDS[mode].map((field) => field.name);
}