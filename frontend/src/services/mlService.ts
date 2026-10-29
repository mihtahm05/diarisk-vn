import { api } from "./api";
import { allowedFeatureNames } from "../config/features";
import type {
  BatchResultRow, BatchSummary, BatchValidation, Paged, Patient, PatientInfo, PredictionListItem, PredictionMode,
  PredictionResult, ReportFormat, ReportScope, RiskLevel,
} from "../types";

/**
 * Backend Node gọi tiếp ML service (FastAPI). Frontend chỉ nói chuyện với Node:
 *  POST   /predictions                    { mode, target, patient?, features }
 *  GET    /predictions                    ?scope=mine|patients&riskLevel&from&to&q&page&pageSize
 *  GET    /predictions/:id
 *  DELETE /predictions/:id                (xoá mềm, chỉ cán bộ y tế sở hữu)
 *  GET    /patients                       ?q&riskLevel&from&to&page&pageSize
 *  GET    /patients/:id/predictions
 *  POST   /batches/validate               multipart(file)  -> BatchValidation
 *  POST   /batches/:id/confirm            -> { rows: BatchResultRow[] }
 *  GET    /batches                        -> BatchSummary[] (các đợt của cán bộ hiện tại)
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

  remove(id: string): Promise<void> {
    return api.delete<void>(`/predictions/${encodeURIComponent(id)}`);
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

  patientPredictions(patientId: string): Promise<PredictionListItem[]> {
    return api.get<PredictionListItem[]>(`/patients/${encodeURIComponent(patientId)}/predictions`);
  },

  validateBatch(file: File): Promise<BatchValidation> {
    const form = new FormData();
    form.append("file", file);
    return api.upload<BatchValidation>("/batches/validate", form);
  },

  confirmBatch(batchId: string): Promise<{ rows: BatchResultRow[] }> {
    return api.post<{ rows: BatchResultRow[] }>(`/batches/${encodeURIComponent(batchId)}/confirm`);
  },

  batches(): Promise<BatchSummary[]> {
    return api.get<BatchSummary[]>("/batches");
  },

  downloadTemplate(): Promise<void> {
    return api.download("/templates/active/download", { fallbackName: "diarisk_template.xlsx" });
  },

  exportReport(p: { scope: ReportScope; format: ReportFormat; patientId?: string; batchId?: string; from?: string; to?: string }): Promise<void> {
    return api.download("/reports/export", { method: "POST", body: p, fallbackName: `diarisk_report.${p.format}` });
  },
};
