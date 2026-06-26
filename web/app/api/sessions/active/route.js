import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// Returns the currently open session relevant to the caller (or null).
//   teacher -> their own open session, with a live present count
//   student -> the open session for their subject
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'teacher', 'student');
  if (error) return NextResponse.json({ error }, { status });

  if (user.role === 'teacher') {
    const { rows } = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'present') AS present_count
         FROM attendance_sessions s
        WHERE s.teacher_id = $1 AND s.is_open = TRUE
        ORDER BY s.opened_at DESC LIMIT 1`,
      [user.id]
    );
    return NextResponse.json({ session: rows[0] || null });
  }

  // student
  const { rows } = await query(
    `SELECT s.id, s.subject, s.semester, s.section, s.opened_at, u.name AS teacher_name
       FROM attendance_sessions s
       JOIN users u ON u.id = s.teacher_id
      WHERE s.is_open = TRUE AND s.subject = $1
      ORDER BY s.opened_at DESC LIMIT 1`,
    [user.subject]
  );
  // has the student already marked this session?
  let alreadyMarked = null;
  if (rows[0]) {
    const m = await query(
      'SELECT status FROM attendance WHERE session_id = $1 AND student_id = $2',
      [rows[0].id, user.id]
    );
    alreadyMarked = m.rows[0]?.status || null;
  }
  return NextResponse.json({ session: rows[0] || null, alreadyMarked });
}
