import { Db, MongoClient } from 'mongodb';
import { env } from './env';

let client: MongoClient | undefined;
let db: Db | undefined;

const collectionNames = [
  'healthcare_staff',
  'user_sessions',
  'patients',
  'predictions',
  'prediction_batches',
  'batch_row_errors',
  'excel_templates',
  'activity_logs',
] as const;

export async function connectDatabase(): Promise<Db> {
  client = new MongoClient(env.mongoUri);
  await client.connect();
  db = client.db(env.dbName);
  await db.command({ ping: 1 });

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  for (const name of collectionNames) {
    if (!existing.has(name)) await db.createCollection(name);
  }

  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('users').createIndex({ phoneNumber: 1 }, { unique: true, sparse: true }),
    db.collection('healthcare_staff').createIndex({ staffCode: 1 }, { unique: true }),
    db.collection('healthcare_staff').createIndex({ userId: 1 }, { unique: true }),
    db.collection('user_sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection('user_sessions').createIndex({ userId: 1, revokedAt: 1 }),
    db.collection('patients').createIndex({ createdById: 1, patientCode: 1 }, { unique: true }),
    db.collection('patients').createIndex({ createdById: 1, createdAt: -1 }),
    db.collection('predictions').createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection('predictions').createIndex({ patientId: 1, createdAt: -1 }),
    db.collection('prediction_batches').createIndex({ staffId: 1, createdAt: -1 }),
    db.collection('batch_row_errors').createIndex({ batchId: 1, rowNo: 1 }),
    db.collection('excel_templates').createIndex({ isActive: 1, uploadedAt: -1 }),
    db.collection('activity_logs').createIndex({ createdAt: -1 }),
  ]);
  console.log(`MongoDB connected: ${env.dbName}`);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('Database is not connected.');
  return db;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}
