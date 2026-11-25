import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { env } from '../config/env';
import { getDb } from '../config/database';
import { isStrongPassword, PASSWORD_REQUIREMENT_MESSAGE } from '../utils/password';

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i),
  password: z.string().refine(isStrongPassword, PASSWORD_REQUIREMENT_MESSAGE),
  confirmPassword: z.string().min(1).max(128),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Mật khẩu xác nhận không khớp.',
});

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP = 10;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function rateLimitHash(value: string): string {
  return createHmac('sha256', env.jwtSecret).update(value).digest('hex');
}

function smtpConfigured(): boolean {
  return Boolean(env.smtpHost && env.smtpPort > 0 && env.smtpUser && env.smtpPass && env.smtpFrom);
}

function responseMessage(): string {
  return 'Nếu địa chỉ email đã được đăng ký, hướng dẫn đặt lại mật khẩu sẽ được gửi.';
}

export async function requestPasswordReset(req: Request, res: Response): Promise<void> {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Vui lòng nhập địa chỉ email hợp lệ.',
      fieldErrors: { email: parsed.error.issues[0]?.message || 'Email không hợp lệ.' },
    });
    return;
  }
  if (!smtpConfigured()) {
    res.status(503).json({ message: 'Dịch vụ email chưa được cấu hình. Vui lòng thử lại sau.' });
    return;
  }

  const db = getDb();
  const email = parsed.data.email.toLowerCase();
  const emailHash = rateLimitHash(email);
  const ipHash = rateLimitHash(req.ip || req.socket.remoteAddress || 'unknown');
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const resetRequests = db.collection('password_reset_tokens');
  const [emailCount, ipCount] = await Promise.all([
    resetRequests.countDocuments({ emailHash, createdAt: { $gte: since } }),
    resetRequests.countDocuments({ ipHash, createdAt: { $gte: since } }),
  ]);
  if (emailCount >= MAX_REQUESTS_PER_EMAIL || ipCount >= MAX_REQUESTS_PER_IP) {
    res.status(429).json({ message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' });
    return;
  }

  const now = new Date();
  const user = await db.collection('users').findOne(
    { email, deletedAt: null, status: 'active' },
    { projection: { _id: 1, email: 1 } },
  );
  const token = randomBytes(32).toString('hex');
  const tokenRecord = {
    tokenHash: hashToken(token),
    userId: user?._id ?? null,
    emailHash,
    ipHash,
    createdAt: now,
    expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    usedAt: user ? null : now,
  };
  const inserted = await resetRequests.insertOne(tokenRecord);
  if (!user) {
    res.status(202).json({ message: responseMessage() });
    return;
  }

  const resetUrl = new URL('/reset-password', env.origin);
  resetUrl.searchParams.set('token', token);
  const text = [
    'DiaRisk VN - Đặt lại mật khẩu',
    '',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này.',
    `Sử dụng liên kết sau trong vòng 15 phút: ${resetUrl.toString()}`,
    'Liên kết chỉ sử dụng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.',
    '',
    'Kết quả sàng lọc DiaRisk VN chỉ mang tính tham khảo, không phải chẩn đoán y khoa.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #dce6f0;border-radius:16px">
          <tr><td style="padding:28px 32px">
            <p style="margin:0 0 6px;color:#0f766e;font-size:13px;font-weight:bold;letter-spacing:1px">DIARISK VN</p>
            <h1 style="margin:0 0 18px;font-size:23px;color:#172033">Đặt lại mật khẩu</h1>
            <p style="font-size:15px;line-height:1.6">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản DiaRisk VN của bạn.</p>
            <p style="margin:24px 0"><a href="${resetUrl.toString()}" style="display:inline-block;padding:12px 20px;border-radius:9px;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold">Tạo mật khẩu mới</a></p>
            <p style="font-size:13px;line-height:1.6;color:#64748b">Liên kết có hiệu lực trong 15 phút và chỉ sử dụng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
            <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b">DiaRisk VN hỗ trợ sàng lọc nguy cơ; kết quả không phải chẩn đoán y khoa.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    requireTLS: !env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass },
  });
  try {
    await transporter.sendMail({
      from: env.smtpFrom,
      to: user.email,
      subject: 'Đặt lại mật khẩu DiaRisk VN',
      text,
      html,
    });
  } catch {
    await resetRequests.updateOne({ _id: inserted.insertedId }, { $set: { usedAt: new Date() } });
    console.error('Password reset email delivery failed.');
    res.status(503).json({ message: 'Không thể gửi email lúc này. Vui lòng thử lại sau.' });
    return;
  }
  res.status(202).json({ message: responseMessage() });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: 'Thông tin đặt lại mật khẩu không hợp lệ.',
      fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [
        String(issue.path[0] || 'form'),
        issue.message,
      ])),
    });
    return;
  }

  const db = getDb();
  const now = new Date();
  const resetRequests = db.collection('password_reset_tokens');
  const tokenHash = hashToken(parsed.data.token);
  const tokenRecord = await resetRequests.findOne({
    tokenHash,
    userId: { $ne: null },
    usedAt: null,
    expiresAt: { $gt: now },
  });
  if (!tokenRecord?.userId) {
    res.status(400).json({ message: 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const consumedAt = new Date();
  const consumed = await resetRequests.updateOne(
    { _id: tokenRecord._id, usedAt: null, expiresAt: { $gt: consumedAt } },
    { $set: { usedAt: consumedAt } },
  );
  if (!consumed.modifiedCount) {
    res.status(400).json({ message: 'Liên kết không hợp lệ hoặc đã được sử dụng.' });
    return;
  }

  const updated = await db.collection('users').updateOne(
    { _id: tokenRecord.userId, deletedAt: null, status: 'active' },
    { $set: { passwordHash, updatedAt: now } },
  );
  if (!updated.matchedCount) {
    res.status(400).json({ message: 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.' });
    return;
  }
  await Promise.all([
    db.collection('user_sessions').updateMany(
      { userId: tokenRecord.userId, revokedAt: null },
      { $set: { revokedAt: now } },
    ),
    resetRequests.updateMany(
      { userId: tokenRecord.userId, usedAt: null },
      { $set: { usedAt: now } },
    ),
  ]);
  res.status(204).end();
}
