import type { Request } from 'express';
import type { ObjectId } from 'mongodb';
import { getDb } from '../config/database';

export async function recordActivity(
  req: Request,
  actionType: string,
  targetTable: string,
  targetId?: string,
  description = actionType,
  actorId?: ObjectId,
): Promise<void> {
  await getDb().collection('activity_logs').insertOne({
    userId: actorId ?? req.auth?.userId ?? null,
    actionType,
    targetTable,
    ...(targetId ? { targetId } : {}),
    description,
    ipAddress: req.ip,
    createdAt: new Date(),
  });
}

export function idString(id: ObjectId): string {
  return id.toHexString();
}
