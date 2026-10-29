import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import path from 'path';
import fsSync from 'fs';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { ObjectId } from 'mongodb';
import { env } from '../config/env';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { decryptJson, encryptJson } from '../utils/encryption';
import { parseObjectId } from '../utils/objectId';
import { createPatientRecord } from './patient.controller';
import { runPrediction, savePrediction, validateFeatures } from './prediction.controller';

const uploadDirectory = path.resolve(process.cwd(), env.uploadDir);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 1000;
const featureNames = [
  'age', 'sex', 'bmi', 'smoker_status', 'physical_activity', 'fruits_daily', 'veggies_daily',
  'heavy_alcohol', 'gen_health', 'ment_hlth_days', 'phys_hlth_days', 'diff_walk', 'education',
  'income', 'any_healthcare', 'no_doc_cost',
];
const templateColumns = ['patientCode', 'fullName', ...featureNames];

fsSync.mkdirSync(uploadDirectory, { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => callback(null, `${randomUUID()}.xlsx`),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.xlsx') {
      callback(new Error('Định dạng tệp không hợp lệ. Vui lòng tải lên tệp Excel (.xlsx).'));
      return;
    }
    callback(null, true);
  },
});

interface BatchRow {
  rowNo: number;
  patientCode?: string;
  fullName: string;
  features: Record<string, number | string>;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object' && 'result' in value) return value.result;
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return value;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
}

async function readWorkbook(filePath: string): Promise<{ rows: BatchRow[]; errors: Array<{
  rowNo: number; columnName: string; errorMessage: string;
}>; totalRows: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) throw new Error('Tệp Excel không có dữ liệu hoặc thiếu dòng tiêu đề.');

  const headerRow = sheet.getRow(1);
  const headerToColumn = new Map<string, number>();
  headerRow.eachCell((cell, column) => {
    const header = normalizeHeader(cellValue(cell.value));
    if (header) headerToColumn.set(header, column);
  });
  const missing = ['fullName', 'age', 'sex', 'bmi'].filter((column) => !headerToColumn.has(column));
  if (missing.length) throw new Error(`Tệp thiếu cột bắt buộc: ${missing.join(', ')}.`);

  const rows: BatchRow[] = [];
  const errors: Array<{ rowNo: number; columnName: string; errorMessage: string }> = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo += 1) {
    const row = sheet.getRow(rowNo);
    const populated: unknown[] = [];
    row.eachCell((cell) => populated.push(cellValue(cell.value)));
    if (populated.every((value) => value === null || value === undefined || value === '')) continue;
    const values: Record<string, unknown> = {};
    for (const [header, column] of headerToColumn) values[header] = cellValue(row.getCell(column).value);
    const fullName = String(values.fullName ?? '').trim();
    if (!fullName) {
      errors.push({ rowNo, columnName: 'fullName', errorMessage: 'Họ tên là trường bắt buộc.' });
    }

    const features: Record<string, unknown> = {};
    for (const name of featureNames) {
      if (values[name] === undefined || values[name] === null || values[name] === '') continue;
      features[name] = values[name];
    }
    const validation = validateFeatures('nonclinical', features);
    for (const [columnName, errorMessage] of Object.entries(validation.errors)) {
      errors.push({ rowNo, columnName, errorMessage });
    }
    const rowHasError = errors.some((error) => error.rowNo === rowNo);
    if (!rowHasError && validation.features) {
      rows.push({
        rowNo,
        patientCode: values.patientCode ? String(values.patientCode).trim() : undefined,
        fullName,
        features: validation.features,
      });
    }
    if (rows.length + new Set(errors.map((error) => error.rowNo)).size > MAX_ROWS) {
      throw new Error(`Tệp vượt quá giới hạn ${MAX_ROWS} dòng dữ liệu.`);
    }
  }
  return { rows, errors, totalRows: rows.length + new Set(errors.map((error) => error.rowNo)).size };
}

export async function validateBatch(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ message: 'Vui lòng tải lên tệp Excel .xlsx hợp lệ (tối đa 10 MB).' });
    return;
  }

  try {
    let result: Awaited<ReturnType<typeof readWorkbook>>;
    try {
      result = await readWorkbook(req.file.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể đọc tệp Excel.';
      res.status(400).json({ message });
      return;
    }
    const now = new Date();
    const inserted = await getDb().collection('prediction_batches').insertOne({
      staffId: req.auth!.userId,
      templateId: null,
      fileName: path.basename(req.file.originalname),
      totalRows: result.totalRows,
      validRows: result.rows.length,
      errorRows: result.errors.length,
      status: result.rows.length ? 'validated' : 'invalid',
      encryptedRows: encryptJson(result.rows),
      createdAt: now,
      predictedAt: null,
    });
    if (result.errors.length) {
      await getDb().collection('batch_row_errors').insertMany(result.errors.map((error) => ({
        batchId: inserted.insertedId,
        ...error,
        createdAt: now,
      })));
    }
    await recordActivity(req, 'VALIDATE_BATCH', 'prediction_batches', String(inserted.insertedId), 'Kiểm tra tệp Excel dự đoán hàng loạt');
    res.status(201).json({
      batchId: String(inserted.insertedId),
      fileName: path.basename(req.file.originalname),
      totalRows: result.totalRows,
      validRows: result.rows.length,
      errorRows: result.errors.length,
      errors: result.errors,
    });
  } finally {
    await fs.unlink(req.file.path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function confirmBatch(req: Request, res: Response): Promise<void> {
  const batchId = parseObjectId(req.params.id);
  if (!batchId) {
    res.status(400).json({ message: 'Mã đợt dự đoán không hợp lệ.' });
    return;
  }
  const db = getDb();
  const batch = await db.collection('prediction_batches').findOne({ _id: batchId, staffId: req.auth!.userId });
  if (!batch) {
    res.status(404).json({ message: 'Không tìm thấy đợt dự đoán.' });
    return;
  }
  if (batch.status !== 'validated' || !batch.encryptedRows) {
    res.status(409).json({ message: 'Đợt này chưa sẵn sàng để dự đoán hoặc đã được xử lý.' });
    return;
  }
  const claim = await db.collection('prediction_batches').updateOne(
    { _id: batchId, status: 'validated' },
    { $set: { status: 'processing' } },
  );
  if (!claim.modifiedCount) {
    res.status(409).json({ message: 'Đợt dự đoán đang được xử lý hoặc đã hoàn tất.' });
    return;
  }

  const rows = decryptJson<BatchRow[]>(batch.encryptedRows);
  const results: Array<{
    patientCode?: string; fullName: string; riskLevel: string; probability: number;
    topFactors: string[]; predictionId: string;
  }> = [];
  const failures: Array<{ rowNo: number; columnName: string; errorMessage: string }> = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    const chunk = rows.slice(offset, offset + 10);
    const settled = await Promise.allSettled(chunk.map(async (row) => {
      const prediction = await runPrediction('nonclinical', row.features);
      let patientId: ObjectId;
      let patientCode = row.patientCode;
      if (patientCode) {
        const existing = await db.collection('patients').findOne({
          createdById: req.auth!.userId,
          patientCode,
          deletedAt: null,
        });
        if (existing) {
          patientId = existing._id;
          await db.collection('patients').updateOne(
            { _id: patientId },
            { $set: { encryptedData: encryptJson({ fullName: row.fullName, birthdate: null, gender: null, phone: null, address: null }), updatedAt: new Date() } },
          );
        } else {
          const created = await createPatientRecord(req.auth!.userId, {
            fullName: row.fullName, birthdate: null, gender: null, phone: null, address: null,
          }, patientCode);
          patientId = new ObjectId(created.patientId);
        }
      } else {
        const created = await createPatientRecord(req.auth!.userId, {
          fullName: row.fullName, birthdate: null, gender: null, phone: null, address: null,
        });
        patientId = new ObjectId(created.patientId);
        patientCode = created.patientCode;
      }

      const saved = await savePrediction(req.auth!.userId, patientId, batchId, 'nonclinical', row.features, prediction);
      return {
        patientCode,
        fullName: row.fullName,
        riskLevel: prediction.riskLevel,
        probability: prediction.probability,
        topFactors: prediction.shap.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, 3).map((item) => item.feature),
        predictionId: String(saved._id),
      };
    }));
    settled.forEach((item, index) => {
      if (item.status === 'fulfilled') results.push(item.value);
      else failures.push({
        rowNo: chunk[index].rowNo,
        columnName: 'prediction',
        errorMessage: 'Không thể xử lý dòng dữ liệu này.',
      });
      if (item.status === 'rejected') {
        console.error(`Batch prediction failed for row ${chunk[index].rowNo}:`, item.reason);
      }
    });
  }

  if (failures.length) {
    await db.collection('batch_row_errors').insertMany(failures.map((error) => ({
      batchId,
      ...error,
      createdAt: new Date(),
    })));
  }
  const status = failures.length ? (results.length ? 'partially_completed' : 'failed') : 'completed';
  await db.collection('prediction_batches').updateOne(
    { _id: batchId },
    { $set: { status, predictedAt: new Date(), completedRows: results.length, failedRows: failures.length }, $unset: { encryptedRows: '' } },
  );
  await recordActivity(req, 'CONFIRM_BATCH', 'prediction_batches', String(batchId), 'Dự đoán hàng loạt');
  res.json({ rows: results, errors: failures, status });
}

export async function listBatches(req: Request, res: Response): Promise<void> {
  const batches = await getDb().collection('prediction_batches')
    .find({ staffId: req.auth!.userId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  res.json(batches.map((batch) => ({
    batchId: String(batch._id),
    fileName: batch.fileName,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    createdAt: batch.createdAt,
  })));
}

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  const templates = await getDb().collection('excel_templates')
    .find({ deletedAt: null })
    .sort({ uploadedAt: -1 })
    .limit(100)
    .toArray();
  res.json(templates.map((template) => ({
    templateId: String(template._id),
    templateName: template.templateName,
    fileName: template.fileName,
    version: template.version,
    isActive: template.isActive,
    uploadedAt: template.uploadedAt,
    uploadedBy: template.uploadedBy ? String(template.uploadedBy) : undefined,
  })));
}

export async function uploadTemplate(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ message: 'Vui lòng chọn tệp Excel (.xlsx).' });
    return;
  }
  const templateName = typeof req.body.templateName === 'string' ? req.body.templateName.trim() : '';
  const version = typeof req.body.version === 'string' ? req.body.version.trim() : '';
  if (!templateName || !version) {
    await fs.unlink(req.file.path);
    res.status(400).json({ message: 'Vui lòng nhập tên và phiên bản tệp mẫu.' });
    return;
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(req.file.path);
  } catch {
    await fs.unlink(req.file.path);
    res.status(400).json({ message: 'Tệp Excel không hợp lệ hoặc không thể đọc.' });
    return;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    await fs.unlink(req.file.path);
    res.status(400).json({ message: 'Tệp Excel không có trang tính.' });
    return;
  }
  const now = new Date();
  await getDb().collection('excel_templates').updateMany({ isActive: true }, { $set: { isActive: false } });
  const inserted = await getDb().collection('excel_templates').insertOne({
    uploadedBy: req.auth!.userId,
    templateName,
    fileName: path.basename(req.file.originalname),
    filePath: req.file.path,
    version,
    isActive: true,
    uploadedAt: now,
    deletedAt: null,
  });
  await recordActivity(req, 'UPLOAD_TEMPLATE', 'excel_templates', String(inserted.insertedId), 'Tải lên tệp Excel mẫu');
  res.status(201).json({
    templateId: String(inserted.insertedId),
    templateName,
    fileName: path.basename(req.file.originalname),
    version,
    isActive: true,
    uploadedAt: now,
    uploadedBy: String(req.auth!.userId),
  });
}

export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const id = parseObjectId(req.params.id);
  if (!id || typeof req.body.isActive !== 'boolean') {
    res.status(400).json({ message: 'Thông tin cập nhật tệp mẫu không hợp lệ.' });
    return;
  }
  const template = await getDb().collection('excel_templates').findOne({ _id: id, deletedAt: null });
  if (!template) {
    res.status(404).json({ message: 'Không tìm thấy tệp mẫu.' });
    return;
  }
  if (req.body.isActive) {
    await getDb().collection('excel_templates').updateMany({ isActive: true }, { $set: { isActive: false } });
  }
  await getDb().collection('excel_templates').updateOne({ _id: id }, { $set: { isActive: req.body.isActive } });
  await recordActivity(req, 'UPDATE_TEMPLATE', 'excel_templates', String(id), 'Cập nhật trạng thái tệp mẫu');
  res.json({
    templateId: String(id),
    templateName: template.templateName,
    fileName: template.fileName,
    version: template.version,
    isActive: req.body.isActive,
    uploadedAt: template.uploadedAt,
    uploadedBy: template.uploadedBy ? String(template.uploadedBy) : undefined,
  });
}

export async function downloadActiveTemplate(_req: Request, res: Response): Promise<void> {
  const template = await getDb().collection('excel_templates').findOne({ isActive: true, deletedAt: null });
  if (template?.filePath) {
    res.download(template.filePath, path.basename(template.fileName), (error) => {
      if (error && !res.headersSent) res.status(500).json({ message: 'Không thể tải tệp mẫu.' });
    });
    return;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DiaRisk data');
  sheet.addRow(templateColumns);
  const sample: Record<string, number | string> = {
    patientCode: 'BN-001',
    fullName: 'Nguyen Van A',
    age: 45,
    sex: 'Female',
    bmi: 25,
    smoker_status: 'never',
    physical_activity: 1,
    fruits_daily: 1,
    veggies_daily: 1,
    heavy_alcohol: 0,
    gen_health: 3,
    ment_hlth_days: 0,
    phys_hlth_days: 0,
    diff_walk: 0,
    education: 4,
    income: 5,
    any_healthcare: 1,
    no_doc_cost: 0,
  };
  sheet.addRow(templateColumns.map((column) => sample[column]));
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="diarisk_template.xlsx"');
  res.send(Buffer.from(buffer));
}
