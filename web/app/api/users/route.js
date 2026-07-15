import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { nextLoginId } from '@/lib/idgen';
import { issueCredentials } from '@/lib/provision';
import { emailConfigured } from '@/lib/email';

export const runtime = 'nodejs';

// admin   -> all users (optionally filtered by ?role= or ?status=)
// teacher -> students of their own subject
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  if (user.role === 'admin') {
    const where = [];
    const values = [];
    let i = 1;
    const role = searchParams.get('role');
    const st = searchParams.get('status');
    if (role) { where.push(`role = $${i++}`); values.push(role); }
    if (st) { where.push(`status = $${i++}`); values.push(st); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT id, role, name, email, status, subject, semester, section, roll_no, created_at,
              (password_hash IS NOT NULL) AS has_password,
              (device_hash IS NOT NULL) AS has_device
         FROM users ${clause} ORDER BY role, created_at`,
      values
    );
    return NextResponse.json({ users: rows });
  }

  const { rows } = await query(
    `SELECT id, role, name, email, status, subject, semester, section, roll_no, created_at,
            (password_hash IS NOT NULL) AS has_password
       FROM users WHERE role = 'student' AND subject = $1 ORDER BY name`,
    [user.subject]
  );
  return NextResponse.json({ users: rows });
}

// POST (admin): provision a teacher or student. Roll no / teacher id AND the
// initial password are auto-generated; the credentials are emailed to the user.
// Body:
//   teacher: { role:'teacher', name, email }
//   student: { role:'student', name, email, semester, section? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const role = b.role;
  if (!['teacher', 'student'].includes(role)) {
    return NextResponse.json({ error: "role must be 'teacher' or 'student'" }, { status: 400 });
  }
  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  let semester = null;
  let section = null;
  if (role === 'student') {
    semester = (b.semester ?? '').toString().trim();
    section = (b.section || '').trim() || null;
    const semNum = Number(semester);
    if (!semester || !Number.isInteger(semNum) || semNum < 1 || semNum > 8) {
      return NextResponse.json({ error: 'Student semester must be a number 1–8' }, { status: 400 });
    }
    semester = String(semNum);
  }

  const emailExists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emailExists.rowCount > 0) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  // Auto-generate a unique login id (roll no / teacher id). Retry on the rare
  // race where two inserts pick the same number (unique index rejects the dup).
  let created = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const loginId = await nextLoginId(role);
    try {
      const { rows } = await query(
        `INSERT INTO users (role, name, email, password_hash, status, semester, section, roll_no)
         VALUES ($1,$2,$3,NULL,'approved',$4,$5,$6)
         RETURNING id, role, name, email, status, semester, section, roll_no`,
        [role, name, email, semester, section, loginId]
      );
      created = rows[0];
    } catch (e) {
      if (e.code === '23505') continue; // duplicate roll_no — retry with next id
      throw e;
    }
  }
  if (!created) {
    return NextResponse.json({ error: 'Could not allocate a unique id, try again' }, { status: 500 });
  }

  const cred = await issueCredentials(request, created, { firstTime: true });
  await audit(request, user.id, 'user.provision', { newUserId: created.id, role, emailSent: cred.sent });

  // Credentials are returned to the (trusted) admin as a fallback for when email
  // delivery isn't configured or the user can't reach their inbox.
  return NextResponse.json(
    {
      user: created,
      credentials: {
        sent: cred.sent,
        idLabel: cred.idLabel,
        loginId: cred.loginId,
        password: cred.password,
        emailConfigured: emailConfigured(),
      },
    },
    { status: 201 }
  );
}
