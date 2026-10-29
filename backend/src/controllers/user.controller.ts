import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { normalizeRole } from '../utils/objectId';

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  birthdate: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  phoneNumber: z.string().trim().min(8).max(20).optional().or(z.literal('')),
});

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await getDb().collection('users').findOne({ _id: req.auth!.userId, deletedAt: null });
  if (!user) {
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }
  const staff = req.auth!.role === 'doctor'
    ? await getDb().collection('healthcare_staff').findOne({ userId: req.auth!.userId })
    : null;
  res.json({
    user: {
      userId: String(user._id),
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      birthdate: user.birthdate instanceof Date ? user.birthdate.toISOString().slice(0, 10) : user.birthdate || '',
      ...(user.gender ? { gender: user.gender } : {}),
      address: user.address || '',
      role: normalizeRole(user.role) || req.auth!.role,
      status: user.status,
      avatar: user.avatar || '',
      ...(staff ? { workplace: staff.workplace, staffCode: staff.staffCode } : {}),
      createdAt: user.createdAt,
    },
  });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin hồ sơ không hợp lệ.',
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
    });
    return;
  }

  const value = parsed.data;
  const changes: Record<string, unknown> = { updatedAt: new Date() };
  if (value.name !== undefined) changes.name = value.name;
  if (value.birthdate !== undefined) {
    if (value.birthdate && Number.isNaN(Date.parse(value.birthdate))) {
      res.status(400).json({ message: 'Ngày sinh không hợp lệ.', fieldErrors: { birthdate: 'Ngày sinh không hợp lệ.' } });
      return;
    }
    changes.birthdate = value.birthdate ? new Date(value.birthdate) : null;
  }
  if (value.gender !== undefined) changes.gender = value.gender || null;
  if (value.address !== undefined) changes.address = value.address || null;
  if (value.phoneNumber !== undefined) changes.phoneNumber = value.phoneNumber || null;

  try {
    const result = await getDb().collection('users').updateOne(
      { _id: req.auth!.userId, deletedAt: null },
      { $set: changes },
    );
    if (!result.matchedCount) {
      res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
      return;
    }
    await recordActivity(req, 'UPDATE_PROFILE', 'users', String(req.auth!.userId), 'Cập nhật hồ sơ cá nhân');
    res.json({ message: 'Cập nhật thông tin thành công.' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res.status(409).json({ message: 'Số điện thoại đã được sử dụng.' });
      return;
    }
    throw error;
  }
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(1),
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Mật khẩu xác nhận không khớp.',
});

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin đổi mật khẩu không hợp lệ.',
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])),
    });
    return;
  }

  const user = await getDb().collection('users').findOne({ _id: req.auth!.userId, deletedAt: null });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ message: 'Mật khẩu hiện tại không chính xác.', fieldErrors: { currentPassword: 'Mật khẩu hiện tại không chính xác.' } });
    return;
  }
  const now = new Date();
  await getDb().collection('users').updateOne(
    { _id: req.auth!.userId },
    { $set: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), updatedAt: now } },
  );
  await getDb().collection('user_sessions').updateMany(
    { userId: req.auth!.userId, revokedAt: null },
    { $set: { revokedAt: now } },
  );
  await recordActivity(req, 'CHANGE_PASSWORD', 'users', String(req.auth!.userId), 'Đổi mật khẩu');
  res.status(204).end();
}
