import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL is required for the User Service database.');
  const pool = new pg.Pool({ connectionString, options: '-c search_path=users,pg_catalog' });
  pool.on('error', error => { console.error('User database connection:', error.message); });
  return pool;
}

let pool: pg.Pool | undefined;
export function getPool(): pg.Pool {
  return pool ??= createPool();
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
