import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// Attendance records.
//   teacher -> records from their own sessions
//   admin   -> all records
// Filters: ?session_id= &status= &subject=
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const where = [];
  const values = [];
  let i = 1;

  if (user.role === 'teacher') {
    where.push(`s.teacher_id = $${i++}`);
    values.push(user.id);
  }
  const sessionId = searchParams.get('session_id');
  const st = searchParams.get('status');
  const subject = searchParams.get('subject');
  if (sessionId) { where.push(`a.session_id = $${i++}`); values.push(sessionId); }
  if (st) { where.push(`a.status = $${i++}`); values.push(st); }
  if (subject) { where.push(`s.subject = $${i++}`); values.push(subject); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT a.id, a.status, a.ip_address, a.server_ip, a.ip_ok, a.reason, a.created_at,
            u.name AS student_name, u.roll_no, u.semester, u.section, u.email AS student_email,
            s.subject, s.id AS session_id, s.network_ip AS session_ip,
            t.name AS teacher_name
       FROM attendance a
       JOIN attendance_sessions s ON s.id = a.session_id
       JOIN users u ON u.id = a.student_id
       JOIN users t ON t.id = s.teacher_id
       ${clause}
      ORDER BY a.created_at DESC LIMIT 2000`,
    values
  );
  return NextResponse.json({ attendance: rows });
}
