import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// Returns the currently open session relevant to the caller (or null).
//   teacher -> their own open session, with a live student present count + window
//   student -> the open session for their subject, with window + already-marked
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'teacher', 'student');
  if (error) return NextResponse.json({ error }, { status });

  if (user.role === 'teacher') {
    const { rows } = await query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM attendance a
                WHERE a.session_id = s.id AND a.attendee_role='student' AND a.status='present') AS present_count,
              (SELECT COUNT(*) FROM attendance a
                WHERE a.session_id = s.id AND a.attendee_role='student' AND a.status='late') AS late_count
         FROM attendance_sessions s
        WHERE s.teacher_id = $1 AND s.is_open = TRUE
        ORDER BY s.opened_at DESC LIMIT 1`,
      [user.id]
    );
    return NextResponse.json({ session: rows[0] || null });
  }

  // student — open session for a course they're enrolled in
  const { rows } = await query(
    `SELECT s.id, s.subject, s.semester, s.section, s.opened_at,
            s.attendance_until, s.ends_at, u.name AS teacher_name
       FROM attendance_sessions s
       JOIN enrollments e ON e.offering_id = s.offering_id AND e.student_id = $1
       JOIN users u ON u.id = s.teacher_id
      WHERE s.is_open = TRUE
      ORDER BY s.opened_at DESC LIMIT 1`,
    [user.id]
  );
  const session = rows[0] || null;
  let alreadyMarked = null;
  let windowClosed = false;
  if (session) {
    const m = await query(
      'SELECT status FROM attendance WHERE session_id = $1 AND student_id = $2',
      [session.id, user.id]
    );
    alreadyMarked = m.rows[0]?.status || null;
    windowClosed = session.attendance_until && new Date() > new Date(session.attendance_until);
  }
  return NextResponse.json({ session, alreadyMarked, window_closed: windowClosed });
}
