import { api } from "./api";
import { allowedFeatureNames } from "../config/features";
import type {
  BatchDetail, BatchResultRow, BatchSummary, BatchValidation, Paged, Patient, PatientInfo, PredictionListItem, PredictionMode,
  DashboardMetrics, PredictionResult, ReportFormat, ReportScope, RiskLevel,
} from "../types";

/**
 * Backend Node gọi tiếp ML service (FastAPI). Frontend chỉ nói chuyện với Node:
 *  POST   /predictions                    { mode, target, patient?, features }
 *  POST   /predictions/bulk-delete        { predictionIds } (chỉ xóa mềm đánh giá bệnh nhân)
 *  GET    /predictions                    ?scope=mine|patients&riskLevel&from&to&q&page&pageSize
 *  GET    /predictions/:id
 *  DELETE /predictions/:id                (xoá mềm, chỉ cán bộ y tế sở hữu)
 *  GET    /patients                       ?q&riskLevel&from&to&page&pageSize
 *  GET    /patients/:id/predictions
 *  POST   /batches/validate               multipart(file)  -> BatchValidation
 *  POST   /batches/:id/confirm            -> { rows: BatchResultRow[] }
 *  GET    /batches                        -> Paged<BatchSummary> (các đợt của cán bộ hiện tại)
 *  DELETE /batches/:id                    (ẩn mềm phiên khỏi lịch sử)
 *  GET    /dashboard/metrics              -> tổng hợp MongoDB theo role
 *  GET    /templates/active/download
 *  POST   /reports/export                 { scope, format, patientId?, batchId?, from?, to? } -> file
 */

export interface PredictInput {
  mode: PredictionMode;
  target: "self" | "patient";
  patient?: PatientInfo | { patientId: string };
  /** Khóa = tên trường trong schema model; phân loại có thể là chuỗi. */
  features: Record<string, number | string>;
}

/** Chỉ giữ các đặc trưng hợp lệ của chế độ => không bao giờ gửi biến rò rỉ (LEAKAGE) hay khoá lạ. */
function sanitizeFeatures(mode: PredictionMode, features: Record<string, number | string>): Record<string, number | string> {
  const allowed = new Set(allowedFeatureNames(mode));
  return Object.fromEntries(Object.entries(features).filter(([k]) => allowed.has(k)));
}

export interface HistoryFilter {
  scope?: "mine" | "patients";
  riskLevel?: RiskLevel | "";
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export const mlService = {
  dashboardMetrics(): Promise<DashboardMetrics> {
    return api.get<DashboardMetrics>("/dashboard/metrics");
  },

  predict(input: PredictInput): Promise<PredictionResult> {
    return api.post<PredictionResult>("/predictions", {
      mode: input.mode,
      target: input.target,
      patient: input.patient,
      features: sanitizeFeatures(input.mode, input.features),
    });
  },

  history(f: HistoryFilter = {}): Promise<Paged<PredictionListItem>> {
    return api.get<Paged<PredictionListItem>>("/predictions", {
      scope: f.scope ?? "mine",
      riskLevel: f.riskLevel || undefined,
      from: f.from,
      to: f.to,
      q: f.q,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 10,
    });
  },

  detail(id: string): Promise<PredictionResult> {
    return api.get<PredictionResult>(`/predictions/${encodeURIComponent(id)}`);
  },

  downloadPredictionPdf(id: string): Promise<void> {
    return api.download(`/predictions/${encodeURIComponent(id)}/pdf`, {
      fallbackName: `diarisk_prediction_${id}.pdf`,
    });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/predictions/${encodeURIComponent(id)}`);
  },

  removeMany(ids: string[]): Promise<{ deletedCount: number }> {
    return api.post<{ deletedCount: number }>("/predictions/bulk-delete", { predictionIds: ids });
  },

  patients(f: HistoryFilter = {}): Promise<Paged<Patient>> {
    return api.get<Paged<Patient>>("/patients", {
      q: f.q,
      riskLevel: f.riskLevel || undefined,
      from: f.from,
      to: f.to,
      page: f.page ?? 1,
      pageSize: f.pageSize ?? 10,
    });
  },

  generatePatientCode(): Promise<{ patientCode: string }> {
    return api.get<{ patientCode: string }>("/patients/code");
  },

  createPatient(
    patient: Required<Pick<PatientInfo, "fullName" | "birthdate" | "gender" | "phone">>
      & Pick<PatientInfo, "patientCode">,
  ): Promise<Patient> {
    return api.post<Patient>("/patients", patient);
  },

  patientPredictions(patientId: string): Promise<PredictionListItem[]> {
    return api.get<PredictionListItem[]>(`/patients/${encodeURIComponent(patientId)}/predictions`);
  },

  validateBatch(file: File): Promise<BatchValidation> {
    const form = new FormData();
    form.append("file", file);
    return api.upload<BatchValidation>("/batches/validate", form);
  },

  confirmBatch(batchId: string): Promise<{ rows: BatchResultRow[]; errors: BatchValidation["errors"]; status: string }> {
    return api.post<{ rows: BatchResultRow[]; errors: BatchValidation["errors"]; status: string }>(`/batches/${encodeURIComponent(batchId)}/confirm`);
  },

  batches(f: { page?: number; pageSize?: number } = {}): Promise<Paged<BatchSummary>> {
    return api.get<Paged<BatchSummary>>("/batches", { page: f.page ?? 1, pageSize: f.pageSize ?? 5 });
  },

  removeBatch(batchId: string): Promise<void> {
    return api.delete<void>(`/batches/${encodeURIComponent(batchId)}`);
  },

  batchDetail(batchId: string): Promise<BatchDetail> {
    return api.get<BatchDetail>(`/batches/${encodeURIComponent(batchId)}`);
  },

  downloadTemplate(): Promise<void> {
    return api.download("/templates/active/download", { fallbackName: "diarisk_template.xlsx" });
  },

  exportReport(p: { scope: ReportScope; format: ReportFormat; patientId?: string; batchId?: string; from?: string; to?: string }): Promise<void> {
    return api.download("/reports/export", { method: "POST", body: p, fallbackName: `diarisk_report.${p.format}` });
  },
};
