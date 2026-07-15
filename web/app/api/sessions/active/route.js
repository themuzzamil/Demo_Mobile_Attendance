import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { trustedIp, sameNetwork } from '@/lib/ip';

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
                WHERE a.session_id = s.id AND a.attendee_role='student' AND a.status='late') AS late_count,
              (SELECT COUNT(*) FROM attendance a
                WHERE a.session_id = s.id AND a.attendee_role='student' AND a.status='pending') AS pending_count
         FROM attendance_sessions s
        WHERE s.teacher_id = $1 AND s.is_open = TRUE
        ORDER BY s.opened_at DESC LIMIT 1`,
      [user.id]
    );
    return NextResponse.json({ session: rows[0] || null });
  }

  // student — open session for a course they're enrolled in.
  // network_ip is a dev-only fallback (a GET has no body); in production the
  // platform decides, so a student cannot fake being on the class network.
  const reportedIp = new URL(request.url).searchParams.get('network_ip');
  const { rows } = await query(
    `SELECT s.id, s.subject, s.semester, s.section, s.opened_at,
            s.attendance_until, s.ends_at, s.network_ip, u.name AS teacher_name
       FROM attendance_sessions s
       JOIN enrollments e ON e.offering_id = s.offering_id AND e.student_id = $1
       JOIN users u ON u.id = s.teacher_id
      WHERE s.is_open = TRUE
      ORDER BY s.opened_at DESC LIMIT 1`,
    [user.id]
  );
  const row = rows[0] || null;
  let alreadyMarked = null;
  let windowClosed = false;
  let ipOk = false;
  let session = null;
  if (row) {
    const m = await query(
      'SELECT status FROM attendance WHERE session_id = $1 AND student_id = $2',
      [row.id, user.id]
    );
    alreadyMarked = m.rows[0]?.status || null;
    windowClosed = row.attendance_until && new Date() > new Date(row.attendance_until);
    ipOk = sameNetwork(trustedIp(request, reportedIp), row.network_ip);
    // Never expose the class network IP to students — knowing it is the whole
    // basis of the check, and it would just tell them what to spoof.
    const { network_ip: _hidden, ...safe } = row;
    session = safe;
  }
  return NextResponse.json({ session, alreadyMarked, window_closed: windowClosed, ip_ok: ipOk });
}
