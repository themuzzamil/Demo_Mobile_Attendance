import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
const ssl = /sslmode=require|neon\.tech|supabase|amazonaws/.test(url || '');

const pool = new pg.Pool({
  connectionString: url,
  ssl: ssl ? { rejectUnauthorized: false } : false,
});

// Drop old/changed tables so the schema rebuilds cleanly (this wipes data).
const DROP = `
  DROP TABLE IF EXISTS messages CASCADE;
  DROP TABLE IF EXISTS permission_requests CASCADE;
  DROP TABLE IF EXISTS attendance CASCADE;
  DROP TABLE IF EXISTS attendance_sessions CASCADE;
  DROP TABLE IF EXISTS timetable_slots CASCADE;
  DROP TABLE IF EXISTS enrollments CASCADE;
  DROP TABLE IF EXISTS course_offerings CASCADE;
  DROP TABLE IF EXISTS courses CASCADE;
  DROP TABLE IF EXISTS classes CASCADE;
  DROP TABLE IF EXISTS audit_logs CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
`;

try {
  const reset = process.argv.includes('--reset');
  if (reset) {
    await pool.query(DROP);
    console.log('• Dropped existing tables (--reset).');
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✓ Migration complete — schema is up to date.');
  if (!reset) {
    console.log('  (run "npm run migrate -- --reset" to drop & rebuild from scratch)');
  }
} catch (err) {
  console.error('✗ Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
