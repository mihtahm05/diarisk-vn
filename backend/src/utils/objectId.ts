import { ObjectId } from 'mongodb';

export function parseObjectId(value: string | string[] | undefined): ObjectId | null {
  const id = Array.isArray(value) ? value[0] : value;
  return id && ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function normalizeRole(role: unknown): 'user' | 'doctor' | 'admin' | null {
  if (role === 'staff') return 'doctor';
  return role === 'user' || role === 'doctor' || role === 'admin' ? role : null;
}
