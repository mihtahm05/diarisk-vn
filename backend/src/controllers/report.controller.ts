import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { getDb } from '../config/database';
import { decryptJson } from '../utils/encryption';
import { parseObjectId } from '../utils/objectId';

const PDF_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const PDF_FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const PDF_BLUE = '#2563eb';
const PDF_INK = '#172033';
const PDF_MUTED = '#64748b';
const PDF_LINE = '#dbe5f4';

const FEATURE_LABELS: Record<string, string> = {
  age: 'Tuổi', age_group: 'Nhóm tuổi', sex: 'Giới tính', bmi: 'Chỉ số BMI',
  smoker_status: 'Tình trạng hút thuốc', physical_activity: 'Hoạt động thể lực',
  fruits_daily: 'Ăn trái cây hằng ngày', veggies_daily: 'Ăn rau hằng ngày',
  heavy_alcohol: 'Uống nhiều rượu bia', gen_health: 'Tự đánh giá sức khỏe chung',
  ment_hlth_days: 'Số ngày sức khỏe tinh thần không tốt',
  phys_hlth_days: 'Số ngày sức khỏe thể chất không tốt', diff_walk: 'Khó đi bộ hoặc leo cầu thang',
  education: 'Trình độ học vấn', income: 'Nhóm thu nhập hộ gia đình',
  any_healthcare: 'Có bảo hiểm hoặc chăm sóc y tế',
  no_doc_cost: 'Không đi khám vì chi phí', high_bp: 'Tăng huyết áp',
  bp_meds: 'Đang dùng thuốc huyết áp', high_chol: 'Cholesterol cao',
  chol_check: 'Đã kiểm tra cholesterol', stroke: 'Tiền sử đột quỵ',
  heart_disease: 'Bệnh tim mạch vành hoặc nhồi máu cơ tim',
  heart_attack: 'Tiền sử nhồi máu cơ tim', kidney_disease: 'Tiền sử bệnh thận',
  depressive_disorder: 'Trầm cảm', asthma: 'Hen suyễn', arthritis: 'Viêm khớp',
  copd: 'Bệnh phổi tắc nghẽn mạn tính (COPD)', last_checkup: 'Lần khám sức khỏe gần nhất',
};

const BINARY_FEATURES = new Set([
  'physical_activity', 'fruits_daily', 'veggies_daily', 'heavy_alcohol', 'diff_walk',
  'any_healthcare', 'no_doc_cost', 'high_bp', 'bp_meds', 'high_chol', 'chol_check',
  'stroke', 'heart_disease', 'heart_attack', 'kidney_disease', 'depressive_disorder',
  'asthma', 'arthritis', 'copd',
]);

type PdfDocument = InstanceType<typeof PDFDocument>;

function featureLabel(name: string): string {
  return FEATURE_LABELS[name] ?? name.replace(/_/g, ' ');
}

function featureValue(name: string, value: number | string): string {
  const raw = String(value);
  const normalized = raw.toLowerCase();
  if (name === 'sex' || name === 'gender') {
    if (normalized === 'female' || normalized === 'nữ') return 'Nữ';
    if (normalized === 'male' || normalized === 'nam') return 'Nam';
  }
  if (name === 'smoker_status') {
    return ({ current: 'Đang hút thuốc', former: 'Đã từng hút, hiện đã bỏ', never: 'Chưa từng hút thuốc' } as Record<string, string>)[normalized] ?? raw;
  }
  if (BINARY_FEATURES.has(name)) {
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return 'Có';
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return 'Không';
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return raw;
  const choiceLabels: Record<string, Record<number, string>> = {
    gen_health: { 1: 'Rất tốt', 2: 'Tốt', 3: 'Khá', 4: 'Yếu', 5: 'Kém' },
    education: {
      1: 'Chưa đi học hoặc chỉ học mẫu giáo', 2: 'Tiểu học đến THCS',
      3: 'Một phần THPT', 4: 'Tốt nghiệp THPT',
      5: 'Một phần cao đẳng hoặc trung cấp', 6: 'Tốt nghiệp đại học trở lên',
    },
    income: {
      1: 'Dưới 10.000 USD/năm', 2: '10.000–15.000 USD/năm',
      3: '15.000–20.000 USD/năm', 4: '20.000–25.000 USD/năm',
      5: '25.000–35.000 USD/năm', 6: '35.000–50.000 USD/năm',
      7: '50.000–75.000 USD/năm', 8: 'Từ 75.000 USD/năm',
    },
    last_checkup: {
      1: 'Trong vòng 1 năm', 2: '1–2 năm trước', 3: '2–5 năm trước',
      4: 'Từ 5 năm trở lên', 5: 'Chưa từng khám',
    },
  };
  const choice = choiceLabels[name]?.[numericValue];
  if (choice) return choice;

  const formatted = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(numericValue);
  if (name === 'age') return `${formatted} tuổi`;
  if (name === 'bmi') return `${formatted} kg/m²`;
  if (name === 'ment_hlth_days' || name === 'phys_hlth_days') return `${formatted} ngày`;
  return formatted;
}

function formatPdfDate(value: string | Date, includeTime = false): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = includeTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' };
  return new Intl.DateTimeFormat('vi-VN', options).format(date);
}

function riskLabel(risk: string): string {
  return ({ low: 'Thấp', medium: 'Trung bình', high: 'Cao' } as Record<string, string>)[risk.toLowerCase()] ?? risk;
}

function modeLabel(mode: string): string {
  return mode.toLowerCase() === 'clinical' ? 'Lâm sàng' : 'Phi lâm sàng';
}

function percentage(value: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function ensurePdfSpace(document: PdfDocument, height: number): void {
  if (document.y + height > document.page.height - document.page.margins.bottom) document.addPage();
}

function drawPdfHeader(document: PdfDocument, title: string, subtitle: string): void {
  document.save();
  document.rect(0, 0, document.page.width, 108).fill('#eff6ff');
  document.font(PDF_FONT_BOLD).fontSize(17).fillColor(PDF_BLUE).text('DiaRisk VN', document.page.margins.left, 18);
  document.font(PDF_FONT_BOLD).fontSize(13).fillColor(PDF_INK).text(title, document.page.margins.left, 46, {
    width: document.page.width - document.page.margins.left - document.page.margins.right,
  });
  document.font(PDF_FONT).fontSize(8).fillColor(PDF_MUTED).text(subtitle, document.page.margins.left, 78);
  document.restore();
  document.y = 122;
}

function drawSectionTitle(document: PdfDocument, title: string): void {
  ensurePdfSpace(document, 32);
  document.moveDown(0.35).font(PDF_FONT_BOLD).fontSize(10).fillColor(PDF_BLUE).text(title);
  document.moveDown(0.25);
}

function drawPdfField(document: PdfDocument, label: string, value: string): void {
  ensurePdfSpace(document, 20);
  document.font(PDF_FONT).fontSize(9).fillColor(PDF_MUTED).text(`${label}: `, { continued: true });
  document.font(PDF_FONT_BOLD).fillColor(PDF_INK).text(value);
  document.moveDown(0.2);
}

function drawFeatureList(document: PdfDocument, features: Record<string, number | string>): void {
  const entries = Object.entries(features);
  if (!entries.length) {
    drawPdfField(document, 'Chỉ số đầu vào', 'Không có dữ liệu');
    return;
  }
  for (const [name, value] of entries) drawPdfField(document, featureLabel(name), featureValue(name, value));
}

function drawRiskSummary(document: PdfDocument, risk: string, probability: number): void {
  ensurePdfSpace(document, 48);
  const colors = risk.toLowerCase() === 'low'
    ? { background: '#ecfdf5', foreground: '#047857', label: 'Nguy cơ thấp' }
    : risk.toLowerCase() === 'high'
      ? { background: '#fef2f2', foreground: '#b91c1c', label: 'Nguy cơ cao' }
      : { background: '#fffbeb', foreground: '#b45309', label: `Nguy cơ ${riskLabel(risk).toLowerCase()}` };
  const x = document.page.margins.left;
  const y = document.y;
  const width = document.page.width - document.page.margins.left - document.page.margins.right;
  document.roundedRect(x, y, width, 38, 6).fill(colors.background);
  document.font(PDF_FONT_BOLD).fontSize(11).fillColor(colors.foreground)
    .text(`${colors.label}     Xác suất ước tính: ${percentage(probability)}`, x + 12, y + 12, { width: width - 24 });
  document.y = y + 50;
}

function drawPdfNotice(document: PdfDocument, title: string, body: string, tone: 'info' | 'warning' = 'info'): void {
  const isWarning = tone === 'warning';
  const boxHeight = isWarning ? 78 : 62;
  const accent = isWarning ? '#b45309' : PDF_BLUE;
  ensurePdfSpace(document, boxHeight + 10);
  const x = document.page.margins.left;
  const y = document.y;
  const width = document.page.width - document.page.margins.left - document.page.margins.right;
  document.roundedRect(x, y, width, boxHeight, 6).fill(isWarning ? '#fff1d6' : '#eff6ff');
  if (isWarning) {
    document.roundedRect(x, y, width, boxHeight, 6).lineWidth(1.2).strokeColor('#f59e0b').stroke();
  }
  document.rect(x, y + 6, 5, boxHeight - 12).fill(accent);
  document.font(PDF_FONT_BOLD).fontSize(isWarning ? 10 : 8).fillColor(accent).text(title, x + 13, y + 9, { width: width - 25 });
  document.font(PDF_FONT).fontSize(isWarning ? 9 : 8).fillColor(isWarning ? '#78350f' : PDF_INK).text(body, x + 13, y + (isWarning ? 29 : 23), {
    width: width - 20,
    height: isWarning ? 42 : 32,
    lineGap: 2,
  });
  document.y = y + boxHeight + 10;
}

function parsePdfFeatures(value: string): Record<string, number | string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, number | string>;
    }
  } catch {
    return {};
  }
  return {};
}

interface PredictionPrivateData {
  features: Record<string, number | string>;
  shap: Array<{ feature: string; shap: number; value?: number | string }>;
}

interface BatchResultRecord {
  patientCode?: string;
  fullName: string;
  riskLevel: string;
  probability: number;
  topFactors: string[];
  features: Record<string, number | string>;
  shap: Array<{ feature: string; shap: number; value?: number | string }>;
}

async function reportRows(req: Request) {
  const { scope, patientId, batchId, from, to } = req.body as {
    scope?: unknown; patientId?: unknown; batchId?: unknown; from?: unknown; to?: unknown;
  };
  if (scope !== 'patient' && scope !== 'batch' && scope !== 'range') {
    throw new Error('Phạm vi báo cáo không hợp lệ.');
  }
  const filter: Record<string, unknown> = { ownerId: req.auth!.userId, deletedAt: null };
  if (scope === 'patient') {
    if (typeof patientId !== 'string' || !parseObjectId(patientId)) throw new Error('Vui lòng chọn bệnh nhân.');
    const patient = await getDb().collection('patients').findOne({
      _id: parseObjectId(patientId)!,
      createdById: req.auth!.userId,
      deletedAt: null,
    });
    if (!patient) throw new Error('Không tìm thấy bệnh nhân.');
    filter.patientId = patient._id;
  } else if (scope === 'batch') {
    if (typeof batchId !== 'string' || !parseObjectId(batchId)) throw new Error('Vui lòng chọn đợt dự đoán.');
    const batch = await getDb().collection('prediction_batches').findOne({
      _id: parseObjectId(batchId)!,
      staffId: req.auth!.userId,
      deletedAt: null,
    });
    if (!batch) throw new Error('Không tìm thấy đợt dự đoán.');
    if (batch.encryptedRows && ['completed', 'partially_completed', 'failed'].includes(batch.status)) {
      const results = decryptJson<BatchResultRecord[]>(batch.encryptedRows);
      return results.map((row) => ({
        createdAt: new Date(batch.predictedAt || batch.createdAt).toISOString(),
        patientCode: row.patientCode || '',
        fullName: row.fullName || '',
        mode: 'nonclinical',
        riskLevel: row.riskLevel,
        probability: Number(row.probability),
        modelVersion: '',
        features: JSON.stringify(row.features),
        factors: row.shap.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, 5)
          .map((item) => item.feature).join(', '),
      }));
    }
    filter.batchId = batch._id;
  } else {
    if ((from !== undefined && typeof from !== 'string') || (to !== undefined && typeof to !== 'string')) {
      throw new Error('Khoảng thời gian không hợp lệ.');
    }
    const dateFilter: Record<string, Date> = {};
    if (typeof from === 'string' && from) {
      if (Number.isNaN(Date.parse(from))) throw new Error('Ngày bắt đầu không hợp lệ.');
      dateFilter.$gte = new Date(from);
    }
    if (typeof to === 'string' && to) {
      if (Number.isNaN(Date.parse(to))) throw new Error('Ngày kết thúc không hợp lệ.');
      dateFilter.$lt = new Date(new Date(to).getTime() + 86400000);
    }
    if (dateFilter.$gte && dateFilter.$lt && dateFilter.$gte >= dateFilter.$lt) {
      throw new Error('Ngày bắt đầu phải trước ngày kết thúc.');
    }
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
  }

  const predictions = await getDb().collection('predictions').find(filter)
    .sort({ createdAt: -1 })
    .limit(10_000)
    .toArray();
  const patientIds = [...new Set(predictions.map((item) => item.patientId?.toString()).filter((value): value is string => Boolean(value)))];
  const patients = patientIds.length
    ? await getDb().collection('patients').find({ _id: { $in: patientIds.map((id) => parseObjectId(id)!) } }).toArray()
    : [];
  const patientMap = new Map(patients.map((patient) => [
    String(patient._id),
    { patientCode: patient.patientCode, ...decryptJson<{ fullName: string }>(patient.encryptedData) },
  ]));

  return Promise.all(predictions.map((prediction) => {
    const data = decryptJson<PredictionPrivateData>(prediction.encryptedData);
    const patient = prediction.patientId ? patientMap.get(String(prediction.patientId)) : undefined;
    return {
      createdAt: new Date(prediction.createdAt).toISOString(),
      patientCode: patient?.patientCode || '',
      fullName: patient?.fullName || '',
      mode: prediction.mode,
      riskLevel: prediction.riskLevel,
      probability: Number(prediction.probability),
      modelVersion: prediction.modelVersion,
      features: JSON.stringify(data.features),
      factors: data.shap.slice().sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap)).slice(0, 5)
        .map((item) => item.feature).join(', '),
    };
  }));
}

export async function exportReport(req: Request, res: Response): Promise<void> {
  const format = req.body.format;
  if (format !== 'xlsx' && format !== 'pdf') {
    res.status(400).json({ message: 'Định dạng báo cáo không được hỗ trợ.' });
    return;
  }
  let rows: Awaited<ReturnType<typeof reportRows>>;
  try {
    rows = await reportRows(req);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Thông tin báo cáo không hợp lệ.' });
    return;
  }
  if (!rows.length) {
    res.status(404).json({ message: 'Không có dữ liệu thỏa mãn để kết xuất báo cáo.' });
    return;
  }

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Prediction report');
    sheet.columns = [
      { header: 'Created at (UTC)', key: 'createdAt', width: 26 },
      { header: 'Patient code', key: 'patientCode', width: 18 },
      { header: 'Patient name', key: 'fullName', width: 28 },
      { header: 'Mode', key: 'mode', width: 16 },
      { header: 'Risk level', key: 'riskLevel', width: 16 },
      { header: 'Probability', key: 'probability', width: 16 },
      { header: 'Model version', key: 'modelVersion', width: 32 },
      { header: 'Input values', key: 'features', width: 70 },
      { header: 'Main factors', key: 'factors', width: 40 },
    ];
    sheet.addRows(rows.map((row) => ({ ...row, probability: `${(row.probability * 100).toFixed(2)}%` })));
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="diarisk_report.xlsx"');
    res.send(Buffer.from(buffer));
    return;
  }

  const document = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.font(PDF_FONT);
  drawPdfHeader(document, 'Báo cáo tổng hợp kết quả đánh giá', `Số kết quả: ${rows.length} · Thời gian hiển thị: giờ Việt Nam`);
  drawPdfNotice(
    document,
    'Thông tin sàng lọc',
    'Kết quả chỉ mang tính tham khảo, không phải chẩn đoán và không thay thế tư vấn của nhân viên y tế.',
  );
  for (const [index, row] of rows.entries()) {
    ensurePdfSpace(document, 100);
    const personName = row.fullName || row.patientCode || 'Tự đánh giá cá nhân';
    document.font(PDF_FONT_BOLD).fontSize(11).fillColor(PDF_INK).text(`${index + 1}. ${personName}`);
    document.moveDown(0.35);
    drawPdfField(document, 'Mã hồ sơ', row.patientCode || 'Tự đánh giá cá nhân');
    drawPdfField(document, 'Thời điểm đánh giá', formatPdfDate(row.createdAt, true));
    drawPdfField(document, 'Chế độ đánh giá', modeLabel(row.mode));
    drawRiskSummary(document, row.riskLevel, row.probability);
    drawPdfField(document, 'Phiên bản mô hình', row.modelVersion || 'Không có thông tin');
    const factors = row.factors
      ? row.factors.split(',').map((feature) => featureLabel(feature.trim())).join(', ')
      : 'Chưa có thông tin';
    drawPdfField(document, 'Các yếu tố nổi bật', factors);
    drawSectionTitle(document, 'Thông tin đầu vào');
    drawFeatureList(document, parsePdfFeatures(row.features));
    ensurePdfSpace(document, 12);
    const left = document.page.margins.left;
    const right = document.page.width - document.page.margins.right;
    document.moveDown(0.3).strokeColor(PDF_LINE).moveTo(left, document.y).lineTo(right, document.y).stroke();
    document.moveDown(0.7);
  }
  document.end();
  const buffer = await complete;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="diarisk_report.pdf"');
  res.send(buffer);
}

export async function exportPredictionPdf(req: Request, res: Response): Promise<void> {
  const predictionId = parseObjectId(req.params.id);
  if (!predictionId) {
    res.status(400).json({ message: 'Mã dự đoán không hợp lệ.' });
    return;
  }
  const db = getDb();
  const prediction = await db.collection('predictions').findOne({
    _id: predictionId,
    ownerId: req.auth!.userId,
    deletedAt: null,
    patientId: { $ne: null },
    batchId: null,
  });
  const ownPrediction = prediction ?? await db.collection('predictions').findOne({
    _id: predictionId,
    ownerId: req.auth!.userId,
    deletedAt: null,
    patientId: null,
    batchId: null,
  });
  if (!ownPrediction) {
    res.status(404).json({ message: 'Không tìm thấy lần dự đoán hoặc bạn không có quyền truy cập.' });
    return;
  }

  const privateData = decryptJson<{
    features: Record<string, number | string>;
    shap: Array<{ feature: string; shap: number; value?: number | string }>;
    warning?: string;
  }>(ownPrediction.encryptedData);
  const patient = ownPrediction.patientId
    ? await db.collection('patients').findOne({
      _id: ownPrediction.patientId,
      createdById: req.auth!.userId,
      deletedAt: null,
    })
    : null;
  if (ownPrediction.patientId && !patient) {
    res.status(404).json({ message: 'Không tìm thấy hồ sơ liên quan đến lần dự đoán.' });
    return;
  }
  const person = patient
    ? decryptJson<{ fullName: string; birthdate?: string | null; gender?: string | null; phone?: string | null }>(patient.encryptedData)
    : await db.collection('users').findOne({ _id: req.auth!.userId, deletedAt: null });
  const personName = patient
    ? (person as { fullName: string }).fullName
    : (person as { name?: string } | null)?.name || 'Người dùng';
  const birthdate = patient
    ? (person as { birthdate?: string | null }).birthdate
    : (person as { birthdate?: Date | string | null } | null)?.birthdate;
  const gender = patient
    ? (person as { gender?: string | null }).gender
    : (person as { gender?: string | null } | null)?.gender;
  const phone = patient
    ? (person as { phone?: string | null }).phone
    : (person as { phoneNumber?: string | null } | null)?.phoneNumber;

  const document = new PDFDocument({ size: 'A4', margin: 42 });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.font(PDF_FONT);
  drawPdfHeader(document, 'Kết quả đánh giá nguy cơ đái tháo đường', 'Thông tin sàng lọc tham khảo · Không phải chẩn đoán y khoa');
  drawSectionTitle(document, 'Thông tin người được đánh giá');
  drawPdfField(document, 'Họ và tên', personName);
  drawPdfField(document, 'Mã hồ sơ', patient?.patientCode || 'Tự đánh giá cá nhân');
  drawPdfField(document, 'Ngày sinh', birthdate ? formatPdfDate(birthdate as string | Date) : 'Chưa cung cấp');
  drawPdfField(document, 'Giới tính', gender ? featureValue('gender', String(gender)) : 'Chưa cung cấp');
  drawPdfField(document, 'Số điện thoại', phone ? String(phone) : 'Chưa cung cấp');

  drawSectionTitle(document, 'Kết quả đánh giá');
  drawRiskSummary(document, String(ownPrediction.riskLevel), Number(ownPrediction.probability));
  drawPdfField(document, 'Thời điểm đánh giá', formatPdfDate(ownPrediction.createdAt, true));
  drawPdfField(document, 'Chế độ đánh giá', modeLabel(String(ownPrediction.mode)));

  drawSectionTitle(document, 'Các chỉ số đầu vào');
  drawFeatureList(document, privateData.features);

  drawSectionTitle(document, 'Yếu tố ảnh hưởng đến kết quả mô hình');
  document.font(PDF_FONT).fontSize(8).fillColor(PDF_MUTED)
    .text('Điểm đóng góp cho biết mức độ mỗi yếu tố ảnh hưởng đến kết quả của mô hình, không khẳng định quan hệ nguyên nhân trong y khoa.');
  document.moveDown(0.4);
  for (const item of privateData.shap) {
    const direction = item.shap > 0 ? 'Tăng điểm mô hình' : item.shap < 0 ? 'Giảm điểm mô hình' : 'Ảnh hưởng rất nhỏ';
    const contribution = new Intl.NumberFormat('vi-VN', {
      signDisplay: 'always', minimumFractionDigits: 3, maximumFractionDigits: 5,
    }).format(item.shap);
    const value = item.value === undefined ? '' : ` · Giá trị: ${featureValue(item.feature, item.value)}`;
    drawPdfField(document, featureLabel(item.feature), `${direction} (${contribution})${value}`);
  }

  drawPdfNotice(
    document,
    'Lưu ý về giới hạn mô hình',
    privateData.warning || 'Mô hình được huấn luyện trên dữ liệu BRFSS tự khai báo và chưa được kiểm định lâm sàng tại Việt Nam.',
    'warning',
  );
  drawPdfNotice(
    document,
    'Thông tin quan trọng',
    'Kết quả chỉ mang tính tham khảo, không thay thế chẩn đoán hoặc tư vấn y tế. Vui lòng trao đổi với nhân viên y tế có chuyên môn.',
  );
  document.end();
  const buffer = await complete;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="diarisk_prediction_${predictionId}.pdf"`);
  res.send(buffer);
}
