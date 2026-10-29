import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../config/database';
import { env } from '../config/env';
import { recordActivity } from '../utils/activityLog';
import { normalizeRole } from '../utils/objectId';

const registerSchema = z.object({
  role: z.enum(['user', 'doctor']).default('user'),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phoneNumber: z.string().trim().regex(/^\+?[\d\s().-]{8,20}$/),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(1).max(128),
  birthdate: z.string().min(1),
  gender: z.enum(['male', 'female']),
  address: z.string().trim().min(1).max(500),
  workplace: z.string().trim().min(2).max(200).optional(),
  staffCode: z.string().trim().min(2).max(80).optional(),
}).refine((value) => !value.confirmPassword || value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Mật khẩu xác nhận không khớp.',
}).refine((value) => value.role !== 'doctor' || Boolean(value.workplace && value.staffCode), {
  path: ['staffCode'],
  message: 'Cán bộ y tế cần khai báo đơn vị công tác và mã cán bộ.',
}).refine((value) => !Number.isNaN(Date.parse(value.birthdate)) && new Date(value.birthdate) <= new Date(), {
  path: ['birthdate'],
  message: 'Ngày sinh không hợp lệ hoặc ở tương lai.',
});

function validationErrors(error: z.ZodError) {
  return Object.fromEntries(error.issues.map((issue) => [String(issue.path[0] || 'form'), issue.message]));
}

async function publicUser(user: Record<string, any>) {
  const staff = normalizeRole(user.role) === 'doctor'
    ? await getDb().collection('healthcare_staff').findOne({ userId: user._id })
    : null;
  return {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber || '',
    birthdate: user.birthdate instanceof Date ? user.birthdate.toISOString().slice(0, 10) : user.birthdate || '',
    ...(user.gender ? { gender: user.gender } : {}),
    address: user.address || '',
    role: normalizeRole(user.role) || 'user',
    status: user.status,
    avatar: user.avatar || '',
    ...(staff ? { workplace: staff.workplace, staffCode: staff.staffCode } : {}),
    createdAt: user.createdAt,
  };
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Dữ liệu đăng ký không hợp lệ.', fieldErrors: validationErrors(parsed.error) });
    return;
  }
  const value = parsed.data;
  const db = getDb();
  const email = value.email.toLowerCase();
  const phoneNumber = value.phoneNumber || undefined;
  if (await db.collection('users').findOne({ email, deletedAt: null })) {
    res.status(409).json({
      message: 'Email đã được đăng ký, vui lòng sử dụng địa chỉ khác.',
      fieldErrors: { email: 'Email này đã được đăng ký.' },
    });
    return;
  }
  if (phoneNumber && await db.collection('users').findOne({ phoneNumber, deletedAt: null })) {
    res.status(409).json({
      message: 'Số điện thoại đã được đăng ký, vui lòng sử dụng số khác.',
      fieldErrors: { phoneNumber: 'Số điện thoại này đã được đăng ký.' },
    });
    return;
  }
  if (value.role === 'doctor' && value.staffCode &&
    await db.collection('healthcare_staff').findOne({ staffCode: value.staffCode })) {
    res.status(409).json({
      message: 'Mã cán bộ đã được đăng ký, vui lòng kiểm tra lại.',
      fieldErrors: { staffCode: 'Mã cán bộ này đã được đăng ký.' },
    });
    return;
  }

  const now = new Date();
  const user = {
    name: value.name,
    email,
    ...(phoneNumber ? { phoneNumber } : {}),
    passwordHash: await bcrypt.hash(value.password, 12),
    birthdate: value.birthdate ? new Date(value.birthdate) : null,
    gender: value.gender || null,
    address: value.address || null,
    role: value.role,
    status: 'active',
    avatar: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  let userId: ObjectId | undefined;
  try {
    const inserted = await db.collection('users').insertOne(user);
    userId = inserted.insertedId;
    if (value.role === 'doctor') {
      await db.collection('healthcare_staff').insertOne({
        userId,
        workplace: value.workplace,
        staffCode: value.staffCode,
        createdAt: now,
      });
    }
    await recordActivity(req, 'REGISTER', 'users', String(userId), 'Đăng ký tài khoản');
    res.status(201).json({ message: 'Đăng ký thành công. Vui lòng đăng nhập.' });
  } catch (error) {
    if (userId) {
      await db.collection('healthcare_staff').deleteOne({ userId });
      await db.collection('users').deleteOne({ _id: userId });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const keyPattern = 'keyPattern' in error && typeof error.keyPattern === 'object' && error.keyPattern !== null
        ? error.keyPattern as Record<string, unknown>
        : {};
      const field = 'staffCode' in keyPattern ? 'staffCode' : 'phoneNumber' in keyPattern ? 'phoneNumber' : 'email';
      const message = field === 'staffCode'
        ? 'Mã cán bộ này đã được đăng ký.'
        : field === 'phoneNumber' ? 'Số điện thoại này đã được đăng ký.' : 'Email này đã được đăng ký.';
      res.status(409).json({
        message,
        fieldErrors: { [field]: message },
      });
      return;
    }
    next(error);
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const identifier = typeof req.body.identifier === 'string'
    ? req.body.identifier.trim().toLowerCase()
    : typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!identifier || !password) {
    res.status(400).json({ message: 'Vui lòng nhập email/số điện thoại và mật khẩu.' });
    return;
  }

  const user = await getDb().collection('users').findOne({
    $or: [{ email: identifier }, { phoneNumber: identifier }],
    deletedAt: null,
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    return;
  }
  if (user.status !== 'active') {
    res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa.' });
    return;
  }
  const role = normalizeRole(user.role);
  if (!role) {
    res.status(403).json({ message: 'Tài khoản chưa được gán vai trò hợp lệ.' });
    return;
  }

  const sessionId = new ObjectId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const token = jwt.sign(
    { sub: String(user._id), sid: String(sessionId), role },
    env.jwtSecret,
    { expiresIn: env.jwtExpires as SignOptions['expiresIn'] },
  );
  await getDb().collection('user_sessions').insertOne({
    _id: sessionId,
    userId: user._id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    createdAt: now,
    expiresAt,
    revokedAt: null,
  });
  await recordActivity(req, 'LOGIN', 'users', String(user._id), 'Đăng nhập', user._id);
  res.json({ token, user: await publicUser(user) });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await getDb().collection('users').findOne({ _id: req.auth!.userId, deletedAt: null });
  if (!user) {
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }
  res.json({ user: await publicUser(user) });
}

export async function logout(req: Request, res: Response): Promise<void> {
  await getDb().collection('user_sessions').updateOne(
    { _id: req.auth!.sessionId, userId: req.auth!.userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await recordActivity(req, 'LOGOUT', 'user_sessions', String(req.auth!.sessionId), 'Đăng xuất');
  res.status(204).end();
}
