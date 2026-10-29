import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { normalizeRole, parseObjectId } from '../utils/objectId';

function escapedRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function paging(req: Request) {
  return {
    page: Math.max(1, Number(req.query.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(req.query.pageSize) || 10)),
  };
}

export async function accounts(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = paging(req);
  const filter: Record<string, unknown> = { deletedAt: null };
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query) {
    const regex = escapedRegex(query);
    filter.$or = [{ name: regex }, { email: regex }, { phoneNumber: regex }];
  }
  if (typeof req.query.status === 'string' && ['active', 'locked'].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  const role = typeof req.query.role === 'string' ? req.query.role : '';
  if (role === 'user' || role === 'doctor' || role === 'staff' || role === 'admin') {
    filter.role = role === 'doctor' ? { $in: ['doctor', 'staff'] } : role;
  }

  const [total, rows] = await Promise.all([
    getDb().collection('users').countDocuments(filter),
    getDb().collection('users')
      .find(filter, { projection: { passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);
  res.json({
    items: rows.map((user) => ({
      userId: String(user._id),
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      role: normalizeRole(user.role) || 'user',
      status: user.status,
      createdAt: user.createdAt,
    })),
    total,
    page,
    pageSize,
  });
}

export async function updateAccount(req: Request, res: Response): Promise<void> {
  const id = parseObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'ID tài khoản không hợp lệ.' });
    return;
  }
  if (id.equals(req.auth!.userId)) {
    res.status(400).json({ message: 'Không thể thay đổi vai trò hoặc trạng thái tài khoản đang đăng nhập.' });
    return;
  }

  const { role, status } = req.body as { role?: unknown; status?: unknown };
  const validRole = role === undefined || role === 'user' || role === 'doctor' || role === 'admin';
  const validStatus = status === undefined || status === 'active' || status === 'locked';
  if (!validRole || !validStatus || (role === undefined && status === undefined)) {
    res.status(400).json({ message: 'Vai trò hoặc trạng thái cập nhật không hợp lệ.' });
    return;
  }

  const db = getDb();
  const existing = await db.collection('users').findOne({ _id: id, deletedAt: null });
  if (!existing) {
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }
  if (normalizeRole(existing.role) === 'admin' && role !== undefined && role !== 'admin') {
    const adminCount = await db.collection('users').countDocuments({ role: 'admin', status: 'active', deletedAt: null });
    if (adminCount <= 1) {
      res.status(409).json({ message: 'Không thể hạ quyền quản trị viên đang hoạt động cuối cùng.' });
      return;
    }
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() };
  if (role !== undefined) changes.role = role;
  if (status !== undefined) changes.status = status;
  await db.collection('users').updateOne({ _id: id }, { $set: changes });
  if (status === 'locked') {
    await db.collection('user_sessions').updateMany(
      { userId: id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  await recordActivity(req, 'UPDATE_ACCOUNT', 'users', String(id), 'Cập nhật vai trò hoặc trạng thái tài khoản');
  res.json({
    userId: String(id),
    name: existing.name,
    email: existing.email,
    phoneNumber: existing.phoneNumber || '',
    role: role === undefined ? normalizeRole(existing.role) : role,
    status: status === undefined ? existing.status : status,
    createdAt: existing.createdAt,
  });
}

function logFilter(query: Record<string, unknown>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (typeof query.actionType === 'string' && query.actionType.trim()) {
    filter.actionType = escapedRegex(query.actionType.trim());
  }
  if (typeof query.from === 'string' || typeof query.to === 'string') {
    const createdAt: Record<string, Date> = {};
    if (typeof query.from === 'string' && !Number.isNaN(Date.parse(query.from))) {
      createdAt.$gte = new Date(query.from);
    }
    if (typeof query.to === 'string' && !Number.isNaN(Date.parse(query.to))) {
      createdAt.$lt = new Date(new Date(query.to).getTime() + 86400000);
    }
    filter.createdAt = createdAt;
  }
  return filter;
}

async function getLogRows(query: Record<string, unknown>) {
  const filter = logFilter(query);
  if (typeof query.q === 'string' && query.q.trim()) {
    const regex = escapedRegex(query.q.trim());
    const matchedUsers = await getDb().collection('users').find(
      { $or: [{ name: regex }, { email: regex }], deletedAt: null },
      { projection: { _id: 1 } },
    ).limit(5000).toArray();
    filter.userId = { $in: matchedUsers.map((user) => user._id) };
  }
  return filter;
}

export async function logs(req: Request, res: Response): Promise<void> {
  const { page, pageSize } = paging(req);
  const filter = await getLogRows(req.query);
  const [total, rows] = await Promise.all([
    getDb().collection('activity_logs').countDocuments(filter),
    getDb().collection('activity_logs').find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);
  const ids = [...new Set(rows.map((row) => row.userId?.toString()).filter((value): value is string => Boolean(value)))];
  const users = ids.length
    ? await getDb().collection('users').find({ _id: { $in: ids.map((value) => parseObjectId(value)!) } }, { projection: { name: 1 } }).toArray()
    : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  res.json({
    items: rows.map((row) => ({
      logId: String(row._id),
      userId: row.userId ? String(row.userId) : undefined,
      userName: row.userId ? names.get(String(row.userId)) : undefined,
      actionType: row.actionType,
      targetTable: row.targetTable,
      targetId: row.targetId,
      description: row.description || '',
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
  });
}

export async function exportLogs(req: Request, res: Response): Promise<void> {
  const format = req.body.format;
  if (format !== 'xlsx' && format !== 'csv') {
    res.status(400).json({ message: 'Định dạng xuất nhật ký không được hỗ trợ.' });
    return;
  }
  const filter = await getLogRows({ ...req.query, ...req.body });
  const rows = await getDb().collection('activity_logs').find(filter).sort({ createdAt: -1 }).limit(10000).toArray();
  const ids = [...new Set(rows.map((row) => row.userId?.toString()).filter((value): value is string => Boolean(value)))];
  const users = ids.length
    ? await getDb().collection('users').find({ _id: { $in: ids.map((value) => parseObjectId(value)!) } }, { projection: { name: 1 } }).toArray()
    : [];
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  const values = rows.map((row) => ({
    time: new Date(row.createdAt).toISOString(),
    user: row.userId ? names.get(String(row.userId)) || String(row.userId) : '',
    action: row.actionType,
    target: row.targetTable || '',
    targetId: row.targetId || '',
    description: row.description || '',
    ipAddress: row.ipAddress || '',
  }));
  if (format === 'csv') {
    const headers = ['time', 'user', 'action', 'target', 'targetId', 'description', 'ipAddress'];
    const csv = [headers, ...values.map((row) => headers.map((header) => row[header as keyof typeof row]))]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activity_logs.csv"');
    res.send(`\uFEFF${csv}`);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Activity logs');
  sheet.columns = [
    { header: 'Time', key: 'time', width: 28 },
    { header: 'User', key: 'user', width: 28 },
    { header: 'Action', key: 'action', width: 22 },
    { header: 'Target', key: 'target', width: 20 },
    { header: 'Target ID', key: 'targetId', width: 30 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'IP address', key: 'ipAddress', width: 20 },
  ];
  sheet.addRows(values);
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="activity_logs.xlsx"');
  res.send(Buffer.from(buffer));
}
