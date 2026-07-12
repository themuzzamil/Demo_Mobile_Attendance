import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const needsSsl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(databaseUrl || '');

// Cache the pool on globalThis so Next.js hot-reload doesn't exhaust connections.
function createPool() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    keepAlive: true,               // keep TCP sockets warm (fewer idle drops)
    idleTimeoutMillis: 10000,      // close our idle conns before Neon does
    connectionTimeoutMillis: 10000, // allow time for Neon compute to wake
  });
  // A background connection error (e.g. Neon closing an idle socket) must not
  // crash the process — the pool just discards that connection.
  pool.on('error', (err) => {
    console.warn('[db] idle client error (will be discarded):', err.message);
  });
  return pool;
}

const globalForPg = globalThis;
export const pool = globalForPg.__attendancePool ?? createPool();
if (process.env.NODE_ENV !== 'production') globalForPg.__attendancePool = pool;

// A query hit a dropped/stale connection (common on Neon after it auto-suspends
// an idle DB) rather than a real SQL error. These are safe to retry on a fresh
// connection — pg has already evicted the bad one from the pool.
function isTransient(err) {
  const code = err && err.code;
  if (['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)) return true;
  // Postgres connection-exception classes + admin-shutdown / cannot-connect-now.
  if (['08000', '08003', '08006', '57P01', '57P02', '57P03'].includes(code)) return true;
  const msg = (err && err.message) || '';
  return /connection terminated|server closed the connection|timeout|connect/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resilient query: transparently retries transient connection failures so the
// caller never sees a spurious error just because the DB was waking up.
export async function query(text, params) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) throw err; // a real SQL error — don't retry
      await sleep(150 * (attempt + 1));  // brief backoff, then retry fresh conn
    }
  }
  throw lastErr;
}
