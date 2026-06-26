import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken, toPublicUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Role-specific required fields:
//   student: name, email, password, semester, section, subject, roll_no
//   teacher: name, email, password, subject
//   admin:   name, email, password
export async function POST(request) {
  const b = (await request.json().catch(() => ({}))) || {};
  const role = b.role;
  if (!['admin', 'teacher', 'student'].includes(role)) {
    return NextResponse.json({ error: 'A valid role is required' }, { status: 400 });
  }
  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  const password = b.password || '';
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  let subject = null;
  let semester = null;
  let section = null;
  let rollNo = null;

  if (role === 'teacher') {
    subject = (b.subject || '').trim();
    if (!subject) return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  }
  if (role === 'student') {
    subject = (b.subject || '').trim();
    semester = (b.semester || '').trim();
    section = (b.section || '').trim();
    rollNo = (b.roll_no || '').trim();
    if (!subject || !semester || !section || !rollNo) {
      return NextResponse.json(
        { error: 'Subject, semester, section and roll no are required' },
        { status: 400 }
      );
    }
  }

  // Uniqueness checks
  const emailExists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emailExists.rowCount > 0) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }
  if (rollNo) {
    const rollExists = await query('SELECT 1 FROM users WHERE roll_no = $1', [rollNo]);
    if (rollExists.rowCount > 0) {
      return NextResponse.json({ error: 'Roll no already registered' }, { status: 409 });
    }
  }

  // Admins are auto-approved (no one sits above them); teachers/students start pending.
  const status = role === 'admin' ? 'approved' : 'pending';

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (role, name, email, password_hash, status, subject, semester, section, roll_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [role, name, email, hash, status, subject, semester, section, rollNo]
  );
  const user = rows[0];
  await audit(request, user.id, 'auth.signup', { role, status });

  // Issue a token immediately; pending users can log in but only see a pending screen.
  const token = signToken(toPublicUser(user));
  return NextResponse.json({ token, user: toPublicUser(user) }, { status: 201 });
}
