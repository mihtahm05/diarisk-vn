import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/database';
import { env } from '../config/env';
import { recordActivity } from '../utils/activityLog';
import { decryptJson, encryptJson } from '../utils/encryption';
import { parseObjectId } from '../utils/objectId';
import { createPatientRecord } from './patient.controller';

type PredictionMode = 'nonclinical' | 'clinical';
type RiskLevel = 'low' | 'medium' | 'high';

interface PredictionFeatures {
  [key: string]: number | string;
}

interface PatientPrivateData {
  fullName: string;
  birthdate: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
}

interface MlResponse {
  risk_level?: string;
  riskLevel?: string;
  probability: number;
  shap_values?: Array<{ feature: string; value?: number | string; shap?: number; impact?: unknown }>;
  shapValues?: Array<{ feature: string; value?: number | string; shap?: number }>;
  advice?: string[];
  recommendations?: string[];
  model_version?: string;
  warning?: string;
}

const nonClinicalLimits: Record<string, [number, number]> = {
  age: [18, 120],
  bmi: [10, 100],
  physical_activity: [0, 1],
  fruits_daily: [0, 1],
  veggies_daily: [0, 1],
  heavy_alcohol: [0, 1],
  gen_health: [1, 5],
  ment_hlth_days: [0, 30],
  phys_hlth_days: [0, 30],
  diff_walk: [0, 1],
  education: [1, 6],
  income: [1, 8],
  any_healthcare: [0, 1],
  no_doc_cost: [0, 1],
};

const clinicalLimits: Record<string, [number, number]> = {
  ...nonClinicalLimits,
  high_bp: [0, 1],
  bp_meds: [0, 1],
  high_chol: [0, 1],
  chol_check: [0, 1],
  stroke: [0, 1],
  heart_disease: [0, 1],
  heart_attack: [0, 1],
  kidney_disease: [0, 1],
  depressive_disorder: [0, 1],
  asthma: [0, 1],
  arthritis: [0, 1],
  copd: [0, 1],
  last_checkup: [1, 5],
};

function validateFeatures(mode: PredictionMode, value: unknown): { features?: PredictionFeatures; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const limits = mode === 'clinical' ? clinicalLimits : nonClinicalLimits;
  const allowedFeatures = [...Object.keys(limits), 'sex', 'smoker_status'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { errors: { features: 'Nhập các chỉ số sức khỏe hợp lệ.' } };
  }
  const source = value as Record<string, unknown>;
  const features: PredictionFeatures = {};
  for (const name of allowedFeatures) {
    const raw = source[name];
    if (raw === undefined || raw === null || raw === '') {
      if (['age', 'sex', 'bmi'].includes(name)) {
        errors[name] = 'Trường này là bắt buộc.';
      }
      continue;
    }
    if (name === 'sex') {
      if (raw !== 'Male' && raw !== 'Female') errors[name] = 'Chọn giới tính hợp lệ.';
      else features[name] = raw;
      continue;
    }
    if (name === 'smoker_status') {
      if (raw !== 'current' && raw !== 'former' && raw !== 'never') {
        errors[name] = 'Chọn tình trạng hút thuốc hợp lệ.';
      } else {
        features[name] = raw;
      }
      continue;
    }
    const [min, max] = limits[name];
    if (typeof raw !== 'number' && typeof raw !== 'string') {
      errors[name] = 'Giá trị phải là số hợp lệ.';
      continue;
    }
    if (typeof raw === 'string' && !raw.trim()) continue;
    const number = typeof raw === 'number' ? raw : Number(raw.trim());
    if (!Number.isFinite(number) || number < min || number > max) {
      errors[name] = `Giá trị phải nằm trong khoảng ${min}–${max}.`;
      continue;
    }
    if (name !== 'bmi' && !Number.isInteger(number)) {
      errors[name] = 'Giá trị phải là số nguyên.';
      continue;
    }
    features[name] = number;
  }
  if (Object.keys(source).some((key) => !allowedFeatures.includes(key))) {
    for (const key of Object.keys(source)) {
      if (!allowedFeatures.includes(key)) errors[key] = 'Chỉ số không được hỗ trợ.';
    }
  }
  const missingCount = allowedFeatures.filter((name) => features[name] === undefined).length;
  const maxMissing = mode === 'clinical' ? 2 : 3;
  if (missingCount > maxMissing) {
    errors.features = `Chỉ được bỏ trống tối đa ${maxMissing} trường; hiện có ${missingCount} trường chưa nhập.`;
  }
  return { features, errors };
}

export async function runPrediction(mode: PredictionMode, features: PredictionFeatures): Promise<{
  riskLevel: RiskLevel;
  probability: number;
  shap: Array<{ feature: string; value?: number | string; shap: number }>;
  advice: string[];
  modelVersion: string;
  warning: string;
}> {
  const response = await fetch(`${env.mlUrl}/predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ features, mode }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`ML service returned HTTP ${response.status}.`);
  const result = await response.json() as MlResponse;
  if (!Number.isFinite(result.probability) || result.probability < 0 || result.probability > 1) {
    throw new Error('ML service returned an invalid probability.');
  }
  const probability = result.probability;
  const rawRisk = (result.risk_level || result.riskLevel || '').toLowerCase();
  if (!['low', 'medium', 'high'].includes(rawRisk)) throw new Error('ML service returned an invalid risk level.');
  const riskLevel = rawRisk as RiskLevel;
  const contributions = result.shap_values || result.shapValues || [];
  if (!Array.isArray(contributions)) throw new Error('ML service returned invalid SHAP contributions.');
  const shap = contributions.map((item) => {
    if (!item || typeof item.feature !== 'string' || !Number.isFinite(item.shap)) {
      throw new Error('ML service returned an invalid SHAP contribution.');
    }
    return {
      feature: item.feature,
      ...(item.value === undefined ? {} : { value: item.value }),
      shap: Number(item.shap),
    };
  });
  const advice = result.advice || result.recommendations;
  if (!Array.isArray(advice) || advice.some((item) => typeof item !== 'string')) {
    throw new Error('ML service returned invalid advice.');
  }
  if (typeof result.model_version !== 'string' || !result.model_version) {
    throw new Error('ML service omitted the model version.');
  }
  if (typeof result.warning !== 'string' || !result.warning) {
    throw new Error('ML service omitted the model-use warning.');
  }
  return {
    riskLevel,
    probability,
    shap,
    advice,
    modelVersion: result.model_version,
    warning: result.warning,
  };
}

function serializePrediction(prediction: Record<string, any>, privateData: {
  features: PredictionFeatures;
  shap: MlResponse['shap_values'];
  advice: string[];
  warning: string;
}, patient?: { patientId: string; patientCode?: string; fullName?: string }) {
  return {
    predictionId: String(prediction._id),
    mode: prediction.mode,
    riskLevel: prediction.riskLevel,
    probability: prediction.probability,
    shap: (privateData.shap || []).map((item) => ({
      feature: item.feature,
      ...(item.value === undefined ? {} : { value: item.value }),
      shap: Number(item.shap) || 0,
    })),
    advice: privateData.advice,
    warning: privateData.warning,
    modelVersion: prediction.modelVersion,
    createdAt: new Date(prediction.createdAt).toISOString(),
    inputs: privateData.features,
    ...(patient ? {
      patientId: patient.patientId,
      patientCode: patient.patientCode,
      patientName: patient.fullName,
    } : {}),
  };
}

async function savePrediction(
  ownerId: ObjectId,
  patientId: ObjectId | null,
  batchId: ObjectId | null,
  mode: PredictionMode,
  features: PredictionFeatures,
  result: Awaited<ReturnType<typeof runPrediction>>,
) {
  const now = new Date();
  const encryptedData = encryptJson({
    features,
    shap: result.shap,
    advice: result.advice,
    warning: result.warning,
  });
  const inserted = await getDb().collection('predictions').insertOne({
    ownerId,
    patientId,
    batchId,
    mode,
    riskLevel: result.riskLevel,
    probability: result.probability,
    encryptedData,
    modelVersion: result.modelVersion,
    createdAt: now,
    deletedAt: null,
  });
  return {
    _id: inserted.insertedId,
    ownerId,
    patientId,
    batchId,
    mode,
    riskLevel: result.riskLevel,
    probability: result.probability,
    encryptedData,
    modelVersion: result.modelVersion,
    createdAt: now,
  };
}

export async function createPrediction(req: Request, res: Response): Promise<void> {
  const mode = req.body.mode === 'clinical' ? 'clinical' : req.body.mode === 'nonclinical' ? 'nonclinical' : null;
  if (!mode) {
    res.status(400).json({ message: 'Chế độ dự đoán không hợp lệ.' });
    return;
  }
  if (mode === 'clinical' && req.auth!.role !== 'doctor' && req.auth!.role !== 'admin') {
    res.status(403).json({ message: 'Chế độ lâm sàng chỉ dành cho cán bộ y tế.' });
    return;
  }
  const target = req.body.target === 'patient' ? 'patient' : req.body.target === 'self' || !req.body.target ? 'self' : null;
  if (!target) {
    res.status(400).json({ message: 'Đối tượng dự đoán không hợp lệ.' });
    return;
  }
  if (target === 'patient' && req.auth!.role !== 'doctor' && req.auth!.role !== 'admin') {
    res.status(403).json({ message: 'Chỉ cán bộ y tế được dự đoán cho bệnh nhân.' });
    return;
  }

  const validated = validateFeatures(mode, req.body.features);
  if (Object.keys(validated.errors).length || !validated.features) {
    res.status(400).json({ message: 'Các chỉ số sức khỏe không hợp lệ.', fieldErrors: validated.errors });
    return;
  }

  let result: Awaited<ReturnType<typeof runPrediction>>;
  try {
    result = await runPrediction(mode, validated.features);
  } catch (error) {
    console.error('ML service prediction failed:', error);
    res.status(503).json({ message: 'Không thể thực hiện dự đoán, vui lòng thử lại sau.' });
    return;
  }

  let patient: { patientId: string; patientCode?: string; fullName?: string } | undefined;
  let patientId: ObjectId | null = null;
  let newPatientData: PatientPrivateData | undefined;
  let requestedPatientCode: string | undefined;
  if (target === 'patient') {
    if (typeof req.body.patient?.patientId === 'string') {
      patientId = parseObjectId(req.body.patient.patientId);
      if (!patientId) {
        res.status(400).json({ message: 'Mã hồ sơ bệnh nhân không hợp lệ.' });
        return;
      }
      const doc = await getDb().collection('patients').findOne({
        _id: patientId,
        createdById: req.auth!.userId,
        deletedAt: null,
      });
      if (!doc) {
        res.status(404).json({ message: 'Không tìm thấy hồ sơ bệnh nhân.' });
        return;
      }
      const details = decryptJson<{ fullName: string }>(doc.encryptedData);
      patient = { patientId: String(doc._id), patientCode: doc.patientCode, fullName: details.fullName };
    } else {
      const details = req.body.patient;
      if (!details || typeof details.fullName !== 'string' || details.fullName.trim().length < 2) {
        res.status(400).json({ message: 'Vui lòng nhập họ tên bệnh nhân.' });
        return;
      }
      const requestedCode = typeof details.patientCode === 'string' ? details.patientCode.trim() : undefined;
      if (requestedCode && !/^[\p{L}\p{N}_-]{2,40}$/u.test(requestedCode)) {
        res.status(400).json({ message: 'Mã bệnh nhân chỉ được chứa chữ, số, dấu gạch dưới hoặc gạch ngang.' });
        return;
      }
      if (details.birthdate && (typeof details.birthdate !== 'string' || Number.isNaN(Date.parse(details.birthdate)))) {
        res.status(400).json({ message: 'Ngày sinh bệnh nhân không hợp lệ.' });
        return;
      }
      if (typeof details.phone === 'string' && details.phone.length > 20) {
        res.status(400).json({ message: 'Số điện thoại bệnh nhân không hợp lệ.' });
        return;
      }
      newPatientData = {
        fullName: details.fullName.trim(),
        birthdate: typeof details.birthdate === 'string' ? details.birthdate : null,
        gender: details.gender === 'male' || details.gender === 'female' ? details.gender : null,
        phone: typeof details.phone === 'string' ? details.phone : null,
        address: typeof details.address === 'string' ? details.address : null,
      };
      requestedPatientCode = requestedCode;
    }
    if (newPatientData) {
      try {
        const created = await createPatientRecord(req.auth!.userId, newPatientData, requestedPatientCode);
        patientId = new ObjectId(created.patientId);
        patient = { ...created, fullName: newPatientData.fullName };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
          res.status(409).json({ message: 'Mã bệnh nhân đã tồn tại trong hồ sơ của bạn.' });
          return;
        }
        throw error;
      }
    }
  }

  const prediction = await savePrediction(req.auth!.userId, patientId, null, mode, validated.features, result);
  await recordActivity(
    req,
    target === 'self' ? 'PREDICT_SELF' : 'PREDICT_PATIENT',
    'predictions',
    String(prediction._id),
    target === 'self' ? 'Dự đoán nguy cơ cá nhân' : 'Dự đoán nguy cơ cho bệnh nhân',
  );
  const data = {
    features: validated.features,
    shap: result.shap,
    advice: result.advice,
    warning: result.warning,
  };
  res.status(201).json(serializePrediction(prediction, data, patient));
}

async function enrichPrediction(prediction: Record<string, any>) {
  const details = decryptJson<{
    features: PredictionFeatures;
    shap: MlResponse['shap_values'];
    advice: string[];
    warning: string;
  }>(prediction.encryptedData);
  let patient: { patientId: string; patientCode?: string; fullName?: string } | undefined;
  if (prediction.patientId) {
    const record = await getDb().collection('patients').findOne({ _id: prediction.patientId });
    if (record) {
      const person = decryptJson<PatientPrivateData>(record.encryptedData);
      patient = { patientId: String(record._id), patientCode: record.patientCode, fullName: person.fullName };
    }
  }
  return serializePrediction(prediction, details, patient);
}

export async function predictionHistory(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const scope = req.query.scope === 'patients' ? 'patients' : 'mine';
  if (scope === 'patients' && req.auth!.role !== 'doctor' && req.auth!.role !== 'admin') {
    res.status(403).json({ message: 'Chức năng này chỉ dành cho cán bộ y tế.' });
    return;
  }

  const filter: Record<string, unknown> = { ownerId: req.auth!.userId, deletedAt: null };
  if (scope === 'mine') filter.patientId = null;
  else filter.patientId = { $ne: null };
  const riskLevel = typeof req.query.riskLevel === 'string' ? req.query.riskLevel.toLowerCase() : '';
  if (['low', 'medium', 'high'].includes(riskLevel)) filter.riskLevel = riskLevel;
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null;
  if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
    const range: Record<string, Date> = {};
    if (from && !Number.isNaN(from.getTime())) range.$gte = from;
    if (to && !Number.isNaN(to.getTime())) range.$lt = new Date(to.getTime() + 86400000);
    filter.createdAt = range;
  }
  const rows = await getDb().collection('predictions').find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLocaleLowerCase() : '';
  const results = await Promise.all(rows.map(enrichPrediction));
  const matching = results.filter((item) => !q
    || item.patientCode?.toLocaleLowerCase().includes(q)
    || item.patientName?.toLocaleLowerCase().includes(q));
  const items = matching.slice((page - 1) * pageSize, page * pageSize).map((item) => ({
    predictionId: item.predictionId,
    mode: item.mode,
    riskLevel: item.riskLevel,
    probability: item.probability,
    createdAt: item.createdAt,
    ...(item.patientId ? {
      patientId: item.patientId,
      patientCode: item.patientCode,
      patientName: item.patientName,
    } : {}),
  }));
  res.json({ items, total: matching.length, page, pageSize });
}

export async function predictionDetail(req: Request, res: Response): Promise<void> {
  const id = parseObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'Mã dự đoán không hợp lệ.' });
    return;
  }
  const prediction = await getDb().collection('predictions').findOne({
    _id: id,
    ownerId: req.auth!.userId,
    deletedAt: null,
  });
  if (!prediction) {
    res.status(404).json({ message: 'Không tìm thấy lần dự đoán.' });
    return;
  }
  res.json(await enrichPrediction(prediction));
}

export async function removePrediction(req: Request, res: Response): Promise<void> {
  const id = parseObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'Mã dự đoán không hợp lệ.' });
    return;
  }
  const prediction = await getDb().collection('predictions').findOne({
    _id: id,
    ownerId: req.auth!.userId,
    deletedAt: null,
  });
  if (!prediction || !prediction.patientId || (req.auth!.role !== 'doctor' && req.auth!.role !== 'admin')) {
    res.status(404).json({ message: 'Không tìm thấy lần dự đoán hoặc bạn không có quyền xóa.' });
    return;
  }
  await getDb().collection('predictions').updateOne({ _id: id }, { $set: { deletedAt: new Date() } });
  await recordActivity(req, 'DELETE_PREDICTION', 'predictions', String(id), 'Xóa mềm lần dự đoán');
  res.status(204).end();
}

export async function patientPredictionHistory(req: Request, res: Response): Promise<void> {
  const patientId = parseObjectId(req.params.id);
  if (!patientId) {
    res.status(400).json({ message: 'Mã bệnh nhân không hợp lệ.' });
    return;
  }
  const patient = await getDb().collection('patients').findOne({
    _id: patientId,
    createdById: req.auth!.userId,
    deletedAt: null,
  });
  if (!patient) {
    res.status(404).json({ message: 'Không tìm thấy hồ sơ bệnh nhân.' });
    return;
  }
  const rows = await getDb().collection('predictions')
    .find({ patientId, ownerId: req.auth!.userId, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();
  const details = decryptJson<PatientPrivateData>(patient.encryptedData);
  res.json(await Promise.all(rows.map(async (row) => {
    const result = await enrichPrediction(row);
    return {
      predictionId: result.predictionId,
      mode: result.mode,
      riskLevel: result.riskLevel,
      probability: result.probability,
      createdAt: result.createdAt,
      patientId: String(patient._id),
      patientCode: patient.patientCode,
      patientName: details.fullName,
    };
  })));
}

export { savePrediction, validateFeatures };
