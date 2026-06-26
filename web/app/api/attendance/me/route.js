import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });
  const { rows } = await query(
    `SELECT a.id, a.status, a.ip_address, a.ip_ok, a.reason, a.created_at,
            s.subject, s.semester, s.section, u.name AS teacher_name
       FROM attendance a
       JOIN attendance_sessions s ON s.id = a.session_id
       JOIN users u ON u.id = s.teacher_id
      WHERE a.student_id = $1
      ORDER BY a.created_at DESC LIMIT 200`,
    [user.id]
  );
  return NextResponse.json({ attendance: rows });
}
