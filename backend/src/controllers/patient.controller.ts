import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { decryptJson, encryptJson } from '../utils/encryption';

interface PatientPrivateData {
  fullName: string;
  birthdate: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
}

const patientSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  patientCode: z.string().trim().min(2).max(40).optional(),
  birthdate: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
});

function privateData(body: z.infer<typeof patientSchema>): PatientPrivateData {
  return {
    fullName: body.fullName,
    birthdate: body.birthdate || null,
    gender: body.gender || null,
    phone: body.phone || null,
    address: body.address || null,
  };
}

export async function createPatientRecord(
  createdById: ObjectId,
  data: PatientPrivateData,
  requestedCode?: string,
): Promise<{ patientId: string; patientCode: string }> {
  const patientCode = requestedCode || `BN-${new ObjectId().toHexString().slice(-8).toUpperCase()}`;
  const now = new Date();
  const result = await getDb().collection('patients').insertOne({
    createdById,
    patientCode,
    encryptedData: encryptJson(data),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return { patientId: String(result.insertedId), patientCode };
}

export async function createPatient(req: Request, res: Response): Promise<void> {
  const parsed = patientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin bệnh nhân không hợp lệ.',
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
    });
    return;
  }
  if (parsed.data.birthdate && Number.isNaN(Date.parse(parsed.data.birthdate))) {
    res.status(400).json({ message: 'Ngày sinh không hợp lệ.', fieldErrors: { birthdate: 'Ngày sinh không hợp lệ.' } });
    return;
  }

  try {
    const patient = await createPatientRecord(req.auth!.userId, privateData(parsed.data), parsed.data.patientCode);
    await recordActivity(req, 'CREATE_PATIENT', 'patients', patient.patientId, 'Tạo hồ sơ bệnh nhân');
    res.status(201).json({ ...patient, ...privateData(parsed.data) });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res.status(409).json({ message: 'Mã bệnh nhân đã tồn tại trong hồ sơ của bạn.' });
      return;
    }
    throw error;
  }
}

export async function listPatients(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLocaleLowerCase() : '';
  const riskLevel = typeof req.query.riskLevel === 'string' ? req.query.riskLevel.toLowerCase() : '';
  const from = typeof req.query.from === 'string' ? new Date(req.query.from) : null;
  const to = typeof req.query.to === 'string' ? new Date(req.query.to) : null;
  const patients = await getDb().collection('patients')
    .find({ createdById: req.auth!.userId, deletedAt: null })
    .sort({ createdAt: -1 })
    .limit(5000)
    .toArray();
  const patientIds = patients.map((patient) => patient._id);
  const predictions = patientIds.length
    ? await getDb().collection('predictions')
      .find({ patientId: { $in: patientIds }, deletedAt: null })
      .sort({ createdAt: -1 })
      .toArray()
    : [];
  const byPatient = new Map<string, typeof predictions>();
  for (const prediction of predictions) {
    const key = String(prediction.patientId);
    const group = byPatient.get(key) || [];
    group.push(prediction);
    byPatient.set(key, group);
  }

  const records = patients.map((patient) => {
    const person = decryptJson<PatientPrivateData>(patient.encryptedData);
    const items = byPatient.get(String(patient._id)) || [];
    const latest = items[0];
    return {
      patientId: String(patient._id),
      patientCode: patient.patientCode,
      ...person,
      createdAt: patient.createdAt,
      lastRiskLevel: latest?.riskLevel,
      predictionCount: items.length,
      predictions: items,
    };
  }).filter((patient) => {
    const matchesText = !q
      || patient.fullName.toLocaleLowerCase().includes(q)
      || patient.patientCode.toLocaleLowerCase().includes(q)
      || (patient.phone || '').toLocaleLowerCase().includes(q);
    const filteredPredictions = patient.predictions.filter((prediction) => {
      const matchesRisk = !riskLevel || prediction.riskLevel === riskLevel;
      const time = new Date(prediction.createdAt).getTime();
      const matchesFrom = !from || Number.isNaN(from.getTime()) || time >= from.getTime();
      const matchesTo = !to || Number.isNaN(to.getTime()) || time <= to.getTime() + 86400000;
      return matchesRisk && matchesFrom && matchesTo;
    });
    const matchesHistory = !riskLevel && !from && !to
      ? true
      : filteredPredictions.length > 0;
    return matchesText && matchesHistory;
  });

  const total = records.length;
  const items = records.slice((page - 1) * pageSize, page * pageSize).map(({ predictions: _predictions, ...item }) => item);
  res.json({ items, total, page, pageSize });
}
