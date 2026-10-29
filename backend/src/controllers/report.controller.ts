import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getDb } from '../config/database';
import { decryptJson } from '../utils/encryption';
import { parseObjectId } from '../utils/objectId';

interface PredictionPrivateData {
  features: Record<string, number | string>;
  shap: Array<{ feature: string; shap: number }>;
}

function ascii(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, (letter) => letter === 'đ' ? 'd' : 'D');
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
    });
    if (!batch) throw new Error('Không tìm thấy đợt dự đoán.');
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

  const document = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.fontSize(18).text('DiaRisk VN - Prediction report', { align: 'center' });
  document.moveDown().fontSize(9).text('DEMO RESULTS ONLY - NOT FOR DIAGNOSIS OR TREATMENT');
  document.moveDown();
  for (const [index, row] of rows.entries()) {
    if (document.y > 700) document.addPage();
    document.fontSize(10).text(`${index + 1}. ${ascii(row.fullName || row.patientCode || 'Personal prediction')}`);
    document.fontSize(8)
      .text(`Date: ${row.createdAt} | Mode: ${row.mode} | Risk: ${row.riskLevel} | Probability: ${(row.probability * 100).toFixed(2)}%`)
      .text(`Inputs: ${ascii(row.features)}`)
      .text(`Main factors: ${ascii(row.factors || 'Not available')}`)
      .moveDown(0.7);
  }
  document.end();
  const buffer = await complete;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="diarisk_report.pdf"');
  res.send(buffer);
}
