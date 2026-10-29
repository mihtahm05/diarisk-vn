import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGODB_DATABASE || 'diarisk_vn',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpires: process.env.JWT_EXPIRES_IN || '30m',
  mlUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  encryptionKey: process.env.DATA_ENCRYPTION_KEY || '',
};

export function validateEnvironment() {
  if (env.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a private value of at least 32 characters.');
  }
  if (!/^(?:[a-fA-F0-9]{64}|[A-Za-z0-9+/]{43}=?)$/.test(env.encryptionKey)) {
    throw new Error('DATA_ENCRYPTION_KEY must be a 32-byte hex or base64-encoded key.');
  }
}
