import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// Pending accounts the caller is allowed to approve:
//   admin   -> pending teachers
//   teacher -> pending students whose subject matches the teacher's subject
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  let rows;
  if (user.role === 'admin') {
    ({ rows } = await query(
      `SELECT id, role, name, email, subject, semester, section, roll_no, created_at
         FROM users WHERE status = 'pending' AND role = 'teacher'
        ORDER BY created_at`
    ));
  } else {
    ({ rows } = await query(
      `SELECT id, role, name, email, subject, semester, section, roll_no, created_at
         FROM users
        WHERE status = 'pending' AND role = 'student' AND subject = $1
        ORDER BY created_at`,
      [user.subject]
    ));
  }
  return NextResponse.json({ pending: rows });
}
