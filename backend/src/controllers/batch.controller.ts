import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import path from 'path';
import fsSync from 'fs';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { env } from '../config/env';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { decryptJson, encryptJson } from '../utils/encryption';
import { parseObjectId } from '../utils/objectId';
import { runPrediction, validateFeatures } from './prediction.controller';

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

interface BatchResultRecord {
  rowNo: number;
  patientCode?: string;
  fullName: string;
  riskLevel: string;
  probability: number;
  topFactors: string[];
  predictionId: string;
  features: Record<string, number | string>;
  shap: Array<{ feature: string; shap: number; value?: number | string }>;
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
  const batch = await db.collection('prediction_batches').findOne({ _id: batchId, staffId: req.auth!.userId, deletedAt: null });
  if (!batch) {
    res.status(404).json({ message: 'Không tìm thấy đợt dự đoán.' });
    return;
  }
  if (batch.status !== 'validated' || !batch.encryptedRows) {
    res.status(409).json({ message: 'Đợt này chưa sẵn sàng để dự đoán hoặc đã được xử lý.' });
    return;
  }
  const claim = await db.collection('prediction_batches').updateOne(
    { _id: batchId, staffId: req.auth!.userId, deletedAt: null, status: 'validated' },
    { $set: { status: 'processing' } },
  );
  if (!claim.modifiedCount) {
    res.status(409).json({ message: 'Đợt dự đoán đang được xử lý hoặc đã hoàn tất.' });
    return;
  }

  const rows = decryptJson<BatchRow[]>(batch.encryptedRows);
  const results: BatchResultRecord[] = [];
  const failures: Array<{ rowNo: number; columnName: string; errorMessage: string }> = [];
  for (let offset = 0; offset < rows.length; offset += 10) {
    const chunk = rows.slice(offset, offset + 10);
    const settled = await Promise.allSettled(chunk.map(async (row) => {
      const prediction = await runPrediction('nonclinical', row.features);
      return {
        rowNo: row.rowNo,
        patientCode: row.patientCode,
        fullName: row.fullName,
        riskLevel: prediction.riskLevel,
        probability: prediction.probability,
        topFactors: prediction.shap.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, 3).map((item) => item.feature),
        predictionId: `${String(batchId)}:${row.rowNo}`,
        features: row.features,
        shap: prediction.shap,
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
  const totalFailures = (batch.errorRows || 0) + failures.length;
  const status = totalFailures ? (results.length ? 'partially_completed' : 'failed') : 'completed';
  await db.collection('prediction_batches').updateOne(
    { _id: batchId },
    {
      $set: {
        status,
        predictedAt: new Date(),
        completedRows: results.length,
        failedRows: totalFailures,
        encryptedRows: encryptJson(results),
      },
    },
  );
  await recordActivity(req, 'CONFIRM_BATCH', 'prediction_batches', String(batchId), 'Dự đoán hàng loạt');
  res.json({ rows: results, errors: failures, status });
}

export async function listBatches(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 5));
  const filter = { staffId: req.auth!.userId, deletedAt: null };
  const collection = getDb().collection('prediction_batches');
  const [total, batches] = await Promise.all([
    collection.countDocuments(filter),
    collection.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);
  res.json({ items: batches.map((batch) => ({
    batchId: String(batch._id),
    fileName: batch.fileName,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    status: batch.status,
    completedRows: batch.completedRows || 0,
    failedRows: batch.failedRows ?? batch.errorRows ?? 0,
    createdAt: batch.createdAt,
    predictedAt: batch.predictedAt || null,
  })), total, page, pageSize });
}

export async function batchDetail(req: Request, res: Response): Promise<void> {
  const batchId = parseObjectId(req.params.id);
  if (!batchId) {
    res.status(400).json({ message: 'Mã đợt dự đoán không hợp lệ.' });
    return;
  }
  const db = getDb();
  const batch = await db.collection('prediction_batches').findOne({
    _id: batchId,
    staffId: req.auth!.userId,
    deletedAt: null,
  });
  if (!batch) {
    res.status(404).json({ message: 'Không tìm thấy đợt dự đoán.' });
    return;
  }

  let rows: BatchResultRecord[] = [];
  if (batch.encryptedRows && ['completed', 'partially_completed', 'failed'].includes(batch.status)) {
    rows = decryptJson<BatchResultRecord[]>(batch.encryptedRows);
  } else if (['completed', 'partially_completed', 'failed'].includes(batch.status)) {
    const predictions = await db.collection('predictions')
      .find({ batchId, ownerId: req.auth!.userId, deletedAt: null })
      .sort({ createdAt: 1 })
      .toArray();
    rows = await Promise.all(predictions.map(async (prediction, index) => {
      const privateData = decryptJson<{
        features: Record<string, number | string>;
        shap: Array<{ feature: string; shap: number; value?: number | string }>;
      }>(prediction.encryptedData);
      const patient = prediction.patientId
        ? await db.collection('patients').findOne({ _id: prediction.patientId, createdById: req.auth!.userId })
        : null;
      const person = patient ? decryptJson<{ fullName: string }>(patient.encryptedData) : null;
      return {
        rowNo: index + 1,
        patientCode: patient?.patientCode,
        fullName: person?.fullName || '',
        riskLevel: prediction.riskLevel,
        probability: prediction.probability,
        topFactors: privateData.shap.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, 3).map((item) => item.feature),
        predictionId: String(prediction._id),
        features: privateData.features,
        shap: privateData.shap,
      };
    }));
  }

  const errors = await db.collection('batch_row_errors')
    .find({ batchId })
    .sort({ rowNo: 1 })
    .toArray();
  res.json({
    batchId: String(batch._id),
    fileName: batch.fileName,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    completedRows: batch.completedRows || 0,
    failedRows: batch.failedRows ?? batch.errorRows ?? 0,
    status: batch.status,
    createdAt: batch.createdAt,
    predictedAt: batch.predictedAt || null,
    rows,
    errors: errors.map(({ rowNo, columnName, errorMessage }) => ({ rowNo, columnName, errorMessage })),
  });
}

export async function deleteBatch(req: Request, res: Response): Promise<void> {
  const batchId = parseObjectId(req.params.id);
  if (!batchId) {
    res.status(400).json({ message: 'Mã đợt dự đoán không hợp lệ.' });
    return;
  }
  const result = await getDb().collection('prediction_batches').updateOne(
    { _id: batchId, staffId: req.auth!.userId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
  if (!result.modifiedCount) {
    res.status(404).json({ message: 'Không tìm thấy phiên dự đoán hoặc bạn không có quyền xóa.' });
    return;
  }
  await recordActivity(req, 'DELETE_BATCH', 'prediction_batches', String(batchId), 'Ẩn phiên dự đoán hàng loạt khỏi lịch sử');
  res.status(204).end();
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
