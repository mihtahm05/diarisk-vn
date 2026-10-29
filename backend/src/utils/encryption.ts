import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env';

export interface EncryptedValue {
  version: 1;
  iv: string;
  tag: string;
  data: string;
}

function getKey(): Buffer {
  const key = /^[a-fA-F0-9]{64}$/.test(env.encryptionKey)
    ? Buffer.from(env.encryptionKey, 'hex')
    : Buffer.from(env.encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

export function encryptJson(value: unknown): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

export function decryptJson<T>(value: EncryptedValue): T {
  if (value.version !== 1) throw new Error('Unsupported encrypted data version.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  const data = Buffer.concat([
    decipher.update(Buffer.from(value.data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(data.toString('utf8')) as T;
}
