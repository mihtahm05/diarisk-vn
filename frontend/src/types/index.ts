// Kiểu dữ liệu dùng chung. Role/status luôn do backend xác nhận.

export type Role = "user" | "doctor" | "admin";
export type AccountStatus = "active" | "locked";
export type Gender = "male" | "female";
export type PredictionMode = "nonclinical" | "clinical";
export type RiskLevel = "low" | "medium" | "high";

export interface AuthUser {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  birthdate?: string;
  gender?: Gender;
  address?: string;
  role: Role;
  status: AccountStatus;
  avatar?: string;
  // Chỉ có với role = doctor
  workplace?: string;
  staffCode?: string;
  createdAt?: string;
}

export interface LoginPayload {
  identifier: string; // email hoặc số điện thoại
  password: string;
  remember: boolean;
}

export interface RegisterPayload {
  // Frontend chỉ được chọn "user" | "doctor". Backend vẫn tự chặn admin.
  role: "user" | "doctor";
  name: string;
  phoneNumber: string;
  email: string;
  birthdate: string;
  gender: Gender;
  address: string;
  password: string;
  confirmPassword: string;
  workplace?: string;
  staffCode?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser; // role lấy từ đây (backend xác nhận)
}

/** Lỗi theo trường: key = tên trường form. */
export interface ApiFieldErrors {
  [field: string]: string;
}

export interface ShapContribution {
  feature: string; // tên đặc trưng của mô hình, vd. "bmi"
  label?: string; // nhãn tiếng Việt nếu backend có
  value?: number | string; // giá trị đầu vào
  shap: number; // >0 đẩy nguy cơ lên, <0 kéo xuống
}

export interface PredictionResult {
  predictionId: string;
  mode: PredictionMode;
  riskLevel: RiskLevel; // do backend phân loại (classifyRisk)
  probability: number; // 0..1
  shap: ShapContribution[];
  advice?: string[]; // lời khuyên do backend cung cấp
  warning?: string;
  modelVersion?: string;
  createdAt: string;
  patientId?: string;
  patientName?: string;
  inputs?: Record<string, number | string>;
}

export interface PredictionListItem {
  predictionId: string;
  mode: PredictionMode;
  riskLevel: RiskLevel;
  probability: number;
  createdAt: string;
  patientId?: string;
  patientCode?: string;
  patientName?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PatientInfo {
  fullName: string;
  patientCode?: string;
  birthdate?: string;
  gender?: Gender;
  phone?: string;
  address?: string;
}

export interface Patient extends PatientInfo {
  patientId: string;
  patientCode: string;
  createdAt: string;
  lastRiskLevel?: RiskLevel;
  predictionCount?: number;
}

export interface BatchRowError {
  rowNo: number;
  columnName: string;
  errorMessage: string;
}

export interface BatchValidation {
  batchId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: BatchRowError[];
}

export interface BatchResultRow {
  patientCode?: string;
  fullName?: string;
  riskLevel: RiskLevel;
  probability: number;
  topFactors: string[];
  predictionId: string;
}

export interface ExcelTemplate {
  templateId: string;
  templateName: string;
  fileName: string;
  version: string;
  isActive: boolean;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface AccountRow {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}

export interface ActivityLogRow {
  logId: string;
  userId?: string;
  userName?: string;
  actionType: string;
  targetTable?: string;
  targetId?: string;
  description: string;
  ipAddress?: string;
  createdAt: string;
}

export type ReportScope = "patient" | "batch" | "range";
export type ReportFormat = "xlsx" | "pdf";

export interface BatchSummary {
  batchId: string;
  fileName: string;
  totalRows: number;
  validRows: number;
  createdAt: string;
}
