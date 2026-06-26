import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const needsSsl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(databaseUrl || '');

// Cache the pool on globalThis so Next.js hot-reload doesn't exhaust connections.
function createPool() {
  return new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
  });
}

const globalForPg = globalThis;
export const pool = globalForPg.__attendancePool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForPg.__attendancePool = pool;

export const query = (text, params) => pool.query(text, params);
