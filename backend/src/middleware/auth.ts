import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import { env } from '../config/env';
import { getDb } from '../config/database';
import { normalizeRole } from '../utils/objectId';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: ObjectId;
        role: 'user' | 'doctor' | 'admin';
        email: string;
        sessionId: ObjectId;
      };
    }
  }
}

interface TokenClaims {
  sub: string;
  sid: string;
}

export async function auth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Vui lòng đăng nhập.' });
    return;
  }

  const token = header.slice(7);
  let claims: TokenClaims;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
      res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });
      return;
    }
    claims = { sub: decoded.sub, sid: decoded.sid };
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn.' });
    return;
  }

  if (!ObjectId.isValid(claims.sub) || !ObjectId.isValid(claims.sid)) {
    res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ.' });
    return;
  }

  try {
    const userId = new ObjectId(claims.sub);
    const sessionId = new ObjectId(claims.sid);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [session, user] = await Promise.all([
      getDb().collection('user_sessions').findOne({
        _id: sessionId,
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }),
      getDb().collection('users').findOne({ _id: userId, deletedAt: null }),
    ]);

    const role = normalizeRole(user?.role);
    if (!session || !user || user.status !== 'active' || !role) {
      res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn hoặc tài khoản không hoạt động.' });
      return;
    }

    req.auth = { userId, sessionId, role, email: user.email };
    next();
  } catch (error) {
    next(error);
  }
}

export function roles(...allowed: Array<'user' | 'doctor' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ message: 'Vui lòng đăng nhập.' });
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      res.status(403).json({ message: 'Bạn không có quyền thực hiện thao tác này.' });
      return;
    }
    next();
  };
}
