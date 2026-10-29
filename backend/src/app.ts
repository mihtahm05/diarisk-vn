import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { env } from './config/env';
import routes from './routes';

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(cors({ origin: env.origin, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'diarisk-backend' }));
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ message: 'Không tìm thấy API yêu cầu.' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Tệp vượt quá giới hạn 10 MB.'
      : 'Không thể nhận tệp tải lên.';
    res.status(400).json({ message });
    return;
  }
  if (error instanceof Error && error.message.startsWith('Định dạng tệp không hợp lệ')) {
    res.status(400).json({ message: error.message });
    return;
  }
  console.error('Unhandled API error:', error);
  res.status(500).json({ message: 'Lỗi máy chủ nội bộ.' });
});

export default app;
