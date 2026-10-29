import app from './app';
import { closeDatabase, connectDatabase } from './config/database';
import { env, validateEnvironment } from './config/env';

async function start() {
  validateEnvironment();
  await connectDatabase();
  const server = app.listen(env.port, () => {
    console.log(`DiaRisk API listening on http://localhost:${env.port}/api/health`);
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(async (error) => {
      await closeDatabase();
      if (error) {
        console.error('Error while closing the HTTP server:', error);
        process.exitCode = 1;
      }
    });
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

void start().catch((error: unknown) => {
  console.error('Startup failed:', error);
  process.exitCode = 1;
});
