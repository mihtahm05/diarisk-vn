import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../config/database';
import { decryptJson } from '../utils/encryption';
import { normalizeRole } from '../utils/objectId';

export async function dashboardMetrics(req: Request, res: Response): Promise<void> {
  const db = getDb();
  const role = req.auth!.role;

  if (role === 'user') {
    const filter = { ownerId: req.auth!.userId, patientId: null, deletedAt: null };
    const [total, distribution, recent] = await Promise.all([
      db.collection('predictions').countDocuments(filter),
      db.collection('predictions').aggregate<{ _id: string; count: number }>([
        { $match: filter },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]).toArray(),
      db.collection('predictions').find(filter)
        .project({ mode: 1, riskLevel: 1, createdAt: 1 })
        .sort({ createdAt: -1 }).limit(6).toArray(),
    ]);
    const riskCounts = { low: 0, medium: 0, high: 0 };
    for (const item of distribution) {
      if (item._id === 'low' || item._id === 'medium' || item._id === 'high') riskCounts[item._id] = item.count;
    }
    res.json({
      role,
      stats: { total, latestRisk: recent[0]?.riskLevel ?? null },
      distribution: riskCounts,
      recent: recent.map((item) => ({
        predictionId: String(item._id),
        mode: item.mode,
        riskLevel: item.riskLevel,
        createdAt: item.createdAt,
      })),
    });
    return;
  }

  if (role === 'doctor') {
    const patientFilter = { createdById: req.auth!.userId, deletedAt: null };
    const predictionFilter = {
      ownerId: req.auth!.userId,
      patientId: { $ne: null },
      deletedAt: null,
    };
    const [patientCount, summaries] = await Promise.all([
      db.collection('patients').countDocuments(patientFilter),
      db.collection('predictions').aggregate<{
        _id: null;
        total: number;
        reviewedPatients: number;
        highRiskPatients: number;
        low: number;
        medium: number;
        high: number;
      }>([
        { $match: predictionFilter },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$patientId',
            count: { $sum: 1 },
            latestRisk: { $first: '$riskLevel' },
            latestAt: { $first: '$createdAt' },
            low: { $sum: { $cond: [{ $eq: ['$riskLevel', 'low'] }, 1, 0] } },
            medium: { $sum: { $cond: [{ $eq: ['$riskLevel', 'medium'] }, 1, 0] } },
            high: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$count' },
            reviewedPatients: { $sum: 1 },
            highRiskPatients: { $sum: { $cond: [{ $eq: ['$latestRisk', 'high'] }, 1, 0] } },
            low: { $sum: '$low' },
            medium: { $sum: '$medium' },
            high: { $sum: '$high' },
          },
        },
      ]).toArray(),
    ]);
    const summary = summaries[0];
    const recentGroups = await db.collection('predictions').aggregate<{
      _id: ObjectId;
      latestRisk: string;
      latestAt: Date;
    }>([
      { $match: predictionFilter },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$patientId', latestRisk: { $first: '$riskLevel' }, latestAt: { $first: '$createdAt' } } },
      { $sort: { latestAt: -1 } },
      { $limit: 6 },
    ]).toArray();
    const patientIds = recentGroups.map((item) => item._id);
    const recentPatients = patientIds.length
      ? await db.collection('patients').find({
        _id: { $in: patientIds },
        ...patientFilter,
      }).toArray()
      : [];
    const patientById = new Map(recentPatients.map((patient) => [String(patient._id), patient]));
    const recent = recentGroups.flatMap((item) => {
      const patient = patientById.get(String(item._id));
      if (!patient) return [];
      const person = decryptJson<{ fullName: string }>(patient.encryptedData);
      return [{
        patientId: String(patient._id),
        patientCode: patient.patientCode,
        fullName: person.fullName,
        lastRiskLevel: item.latestRisk,
        updatedAt: item.latestAt,
      }];
    });
    res.json({
      role,
      stats: {
        patients: patientCount,
        reviewedPatients: summary?.reviewedPatients ?? 0,
        highRiskPatients: summary?.highRiskPatients ?? 0,
        totalPredictions: summary?.total ?? 0,
      },
      distribution: { low: summary?.low ?? 0, medium: summary?.medium ?? 0, high: summary?.high ?? 0 },
      recent,
    });
    return;
  }

  const [roleRows, templateCount, logCount, recentLogs] = await Promise.all([
    db.collection('users').aggregate<{ _id: string; count: number }>([
      { $match: { deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]).toArray(),
    db.collection('excel_templates').countDocuments({ deletedAt: null }),
    db.collection('activity_logs').countDocuments({}),
    db.collection('activity_logs').find({})
      .sort({ createdAt: -1 }).limit(5).toArray(),
  ]);
  const roles = { user: 0, doctor: 0, admin: 0 };
  for (const row of roleRows) {
    const normalized = normalizeRole(row._id);
    if (normalized) roles[normalized] += row.count;
  }
  const userIds = [...new Set(recentLogs.map((item) => item.userId?.toString()).filter((value): value is string => Boolean(value)))];
  const users = userIds.length
    ? await db.collection('users').find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } }, { projection: { name: 1 } }).toArray()
    : [];
  const names = new Map(users.map((item) => [String(item._id), item.name]));
  res.json({
    role,
    stats: { totalAccounts: roles.user + roles.doctor + roles.admin, templates: templateCount, totalLogs: logCount },
    roles,
    recent: recentLogs.map((item) => ({
      logId: String(item._id),
      actionType: item.actionType,
      description: item.description || '',
      userName: item.userId ? names.get(String(item.userId)) : undefined,
      createdAt: item.createdAt,
    })),
  });
}
