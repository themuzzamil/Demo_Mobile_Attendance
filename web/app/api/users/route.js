import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

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
      `SELECT id, role, name, email, status, subject, semester, section, roll_no, created_at
         FROM users ${clause} ORDER BY role, created_at`,
      values
    );
    return NextResponse.json({ users: rows });
  }

  const { rows } = await query(
    `SELECT id, role, name, email, status, subject, semester, section, roll_no, created_at
       FROM users WHERE role = 'student' AND subject = $1 ORDER BY name`,
    [user.subject]
  );
  return NextResponse.json({ users: rows });
}
