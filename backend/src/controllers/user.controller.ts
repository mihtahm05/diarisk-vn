
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';
import { normalizeRole } from '../utils/objectId';
import { isStrongPassword, PASSWORD_REQUIREMENT_MESSAGE } from '../utils/password';

// =====================================================
// 1. VALIDATION
// =====================================================

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  birthdate: z.string().optional().or(z.literal('')),
  gender: z.enum(['male', 'female']).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  phoneNumber: z.string().trim().min(8).max(20).optional().or(z.literal('')),

  // Chỉ bác sĩ được cập nhật đơn vị công tác.
  workplace: z.string().trim().min(2).max(200).optional(),
  staffCode: z.string().trim().min(2).max(80).optional(),
}).strict();

// =====================================================
// 2. GET CURRENT USER
// =====================================================

export async function getMe(
  req: Request,
  res: Response,
): Promise<void> {
  const db = getDb();
  const userId = req.auth!.userId;

  const user = await db.collection('users').findOne({
    _id: userId,
    deletedAt: null,
  });

  if (!user) {
    res.status(404).json({
      message: 'Không tìm thấy tài khoản.',
    });
    return;
  }

  const role = normalizeRole(user.role) || req.auth!.role;

  const staff = role === 'doctor'
    ? await db.collection('healthcare_staff').findOne({
        userId,
      })
    : null;

  res.json({
    user: {
      userId: String(user._id),
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      birthdate:
        user.birthdate instanceof Date
          ? user.birthdate.toISOString().slice(0, 10)
          : user.birthdate || '',
      ...(user.gender ? { gender: user.gender } : {}),
      address: user.address || '',
      role,
      status: user.status,
      avatar: user.avatar || '',

      // Trả dữ liệu cán bộ từ collection riêng.
      ...(role === 'doctor'
        ? {
            staffCode: staff?.staffCode ?? '',
            workplace: staff?.workplace ?? '',
          }
        : {}),

      createdAt: user.createdAt,
    },
  });
}

// =====================================================
// 3. UPDATE PROFILE
// =====================================================

export async function updateMe(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = profileSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin hồ sơ không hợp lệ.',
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0] || 'form'),
          issue.message,
        ]),
      ),
    });
    return;
  }

  const db = getDb();
  const userId = req.auth!.userId;
  const value = parsed.data;
  const now = new Date();

  // Xác nhận tài khoản tồn tại.
  const user = await db.collection('users').findOne({
    _id: userId,
    deletedAt: null,
  });

  if (!user) {
    res.status(404).json({
      message: 'Không tìm thấy tài khoản.',
    });
    return;
  }

  const role = normalizeRole(user.role) || req.auth!.role;

  // Chặn tài khoản không phải bác sĩ cập nhật thông tin cán bộ.
  if ((value.workplace !== undefined || value.staffCode !== undefined) && role !== 'doctor') {
    res.status(403).json({
      message: 'Chỉ cán bộ y tế được cập nhật mã cán bộ hoặc đơn vị công tác.',
    });
    return;
  }

  const staff = role === 'doctor' && (value.workplace !== undefined || value.staffCode !== undefined)
    ? await db.collection('healthcare_staff').findOne({
      userId,
    })
    : null;

  if (role === 'doctor' && (value.workplace !== undefined || value.staffCode !== undefined)) {
    if (!staff && (value.workplace === undefined || value.staffCode === undefined)) {
      res.status(409).json({
        message: 'Hồ sơ cán bộ chưa có mã và đơn vị công tác. Vui lòng nhập cả hai thông tin để tạo hồ sơ.',
      });
      return;
    }

    if (value.staffCode !== undefined) {
      const duplicate = await db.collection('healthcare_staff').findOne({
        staffCode: value.staffCode,
        userId: { $ne: userId },
      });
      if (duplicate) {
        res.status(409).json({
          message: 'Mã cán bộ này đã được sử dụng.',
          fieldErrors: { staffCode: 'Mã cán bộ này đã được sử dụng.' },
        });
        return;
      }
    }
  }

  // Chuẩn bị dữ liệu cập nhật users.
  const changes: Record<string, unknown> = {
    updatedAt: now,
  };

  if (value.name !== undefined) {
    changes.name = value.name;
  }

  if (value.birthdate !== undefined) {
    if (
      value.birthdate &&
      Number.isNaN(Date.parse(value.birthdate))
    ) {
      res.status(400).json({
        message: 'Ngày sinh không hợp lệ.',
        fieldErrors: {
          birthdate: 'Ngày sinh không hợp lệ.',
        },
      });
      return;
    }

    changes.birthdate = value.birthdate
      ? new Date(value.birthdate)
      : null;
  }

  if (value.gender !== undefined) {
    changes.gender = value.gender || null;
  }

  if (value.address !== undefined) {
    changes.address = value.address || null;
  }

  if (value.phoneNumber !== undefined) {
    changes.phoneNumber = value.phoneNumber || null;
  }

  try {
    // Cập nhật thông tin tài khoản.
    const result = await db.collection('users').updateOne(
      {
        _id: userId,
        deletedAt: null,
      },
      {
        $set: changes,
      },
    );

    if (!result.matchedCount) {
      res.status(404).json({
        message: 'Không tìm thấy tài khoản.',
      });
      return;
    }

    // Cập nhật hoặc khôi phục hồ sơ cán bộ khi tài khoản cũ chưa có bản ghi staff.
    if (role === 'doctor' && (value.workplace !== undefined || value.staffCode !== undefined)) {
      if (staff) {
        const staffChanges: Record<string, unknown> = { updatedAt: now };
        if (value.workplace !== undefined) staffChanges.workplace = value.workplace;
        if (value.staffCode !== undefined) staffChanges.staffCode = value.staffCode;
        await db.collection('healthcare_staff').updateOne({ userId }, { $set: staffChanges });
      } else {
        await db.collection('healthcare_staff').insertOne({
          userId,
          workplace: value.workplace,
          staffCode: value.staffCode,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await recordActivity(
      req,
      'UPDATE_PROFILE',
      'users',
      String(userId),
      'Cập nhật hồ sơ cá nhân',
    );

    res.json({
      message: 'Cập nhật thông tin thành công.',
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      const keyPattern = 'keyPattern' in error && typeof error.keyPattern === 'object' && error.keyPattern !== null
        ? error.keyPattern as Record<string, unknown>
        : {};
      if ('staffCode' in keyPattern) {
        res.status(409).json({
          message: 'Mã cán bộ này đã được sử dụng.',
          fieldErrors: { staffCode: 'Mã cán bộ này đã được sử dụng.' },
        });
      } else {
        res.status(409).json({
          message: 'Số điện thoại đã được sử dụng.',
        });
      }
      return;
    }

    throw error;
  }
}

// =====================================================
// 4. CHANGE PASSWORD — GIỮ NGUYÊN
// =====================================================

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().refine(isStrongPassword, PASSWORD_REQUIREMENT_MESSAGE),
  confirmPassword: z.string().min(1),
}).refine(
  (value) => value.newPassword === value.confirmPassword,
  {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận không khớp.',
  },
);

export async function changePassword(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = passwordSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin đổi mật khẩu không hợp lệ.',
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          issue.message,
        ]),
      ),
    });
    return;
  }

  const user = await getDb()
    .collection('users')
    .findOne({
      _id: req.auth!.userId,
      deletedAt: null,
    });

  if (
    !user ||
    !(await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash,
    ))
  ) {
    res.status(400).json({
      message: 'Mật khẩu hiện tại không chính xác.',
      fieldErrors: {
        currentPassword: 'Mật khẩu hiện tại không chính xác.',
      },
    });
    return;
  }

  const now = new Date();

  await getDb().collection('users').updateOne(
    { _id: req.auth!.userId },
    {
      $set: {
        passwordHash: await bcrypt.hash(
          parsed.data.newPassword,
          12,
        ),
        updatedAt: now,
      },
    },
  );

  await getDb().collection('user_sessions').updateMany(
    {
      userId: req.auth!.userId,
      revokedAt: null,
    },
    {
      $set: { revokedAt: now },
    },
  );

  await recordActivity(
    req,
    'CHANGE_PASSWORD',
    'users',
    String(req.auth!.userId),
    'Đổi mật khẩu',
  );

  res.status(204).end();
}
