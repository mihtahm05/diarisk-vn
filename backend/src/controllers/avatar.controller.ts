import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { env } from '../config/env';
import { getDb } from '../config/database';
import { recordActivity } from '../utils/activityLog';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const avatarDirectory = path.resolve(process.cwd(), env.uploadDir, 'avatars');
const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validExtension = ['.jpg', '.jpeg', '.png', '.webp'].includes(extension);
    if (!validExtension || !acceptedMimeTypes.has(file.mimetype)) {
      callback(new Error('Định dạng ảnh không hợp lệ. Chỉ hỗ trợ JPG, PNG hoặc WEBP.'));
      return;
    }
    callback(null, true);
  },
});

function imageExtension(buffer: Buffer): '.jpg' | '.png' | '.webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

function ownedAvatarPath(avatar?: string | null): string | null {
  if (!avatar) return null;
  const match = /^\/api\/uploads\/avatars\/([0-9a-f-]+\.(?:jpg|png|webp))$/i.exec(avatar);
  return match ? path.join(avatarDirectory, match[1]) : null;
}

async function removePreviousAvatar(avatar?: string | null): Promise<void> {
  const previousPath = ownedAvatarPath(avatar);
  if (!previousPath) return;
  try {
    await fs.unlink(previousPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Avatar cleanup failed.');
    }
  }
}

export async function uploadMyAvatar(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ message: 'Vui lòng chọn ảnh JPG, PNG hoặc WEBP (tối đa 5 MB).' });
    return;
  }
  const extension = imageExtension(req.file.buffer);
  if (!extension) {
    res.status(400).json({ message: 'Tệp tải lên không phải ảnh JPG, PNG hoặc WEBP hợp lệ.' });
    return;
  }

  await fs.mkdir(avatarDirectory, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  const filePath = path.join(avatarDirectory, filename);
  await fs.writeFile(filePath, req.file.buffer, { flag: 'wx', mode: 0o644 });

  const user = await getDb().collection('users').findOne(
    { _id: req.auth!.userId, deletedAt: null },
    { projection: { avatar: 1 } },
  );
  if (!user) {
    await fs.unlink(filePath);
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }

  let updated = false;
  try {
    const result = await getDb().collection('users').updateOne(
      { _id: req.auth!.userId, deletedAt: null },
      { $set: { avatar: `/api/uploads/avatars/${filename}`, updatedAt: new Date() } },
    );
    updated = result.matchedCount > 0;
  } catch (error) {
    await fs.unlink(filePath);
    throw error;
  }
  if (!updated) {
    await fs.unlink(filePath);
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }

  await removePreviousAvatar(user.avatar);
  await recordActivity(req, 'UPDATE_AVATAR', 'users', String(req.auth!.userId), 'Cập nhật ảnh đại diện');
  res.json({ avatar: `/api/uploads/avatars/${filename}` });
}

export async function deleteMyAvatar(req: Request, res: Response): Promise<void> {
  const db = getDb();
  const user = await db.collection('users').findOne(
    { _id: req.auth!.userId, deletedAt: null },
    { projection: { avatar: 1 } },
  );
  if (!user) {
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }
  const result = await db.collection('users').updateOne(
    { _id: req.auth!.userId, deletedAt: null },
    { $set: { avatar: null, updatedAt: new Date() } },
  );
  if (!result.matchedCount) {
    res.status(404).json({ message: 'Không tìm thấy tài khoản.' });
    return;
  }

  await removePreviousAvatar(user.avatar);
  await recordActivity(req, 'DELETE_AVATAR', 'users', String(req.auth!.userId), 'Xóa ảnh đại diện');
  res.status(204).end();
}
