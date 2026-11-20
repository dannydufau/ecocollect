import { createApp } from './app.ts';
import { closePool } from './db/pool.ts';

const port = Number(process.env.PORT || 3004);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const app = await createApp();
const server = app.listen(port, () => { console.log(`User service listening on port ${port}`); });
let stopping = false;

function shutdown(): void {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(async error => {
    try { await closePool(); } catch (dbError) { console.error('User database shutdown:', dbError); process.exit(1); }
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
