import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { effectiveIp, getServerSeenIp, sameNetwork } from '@/lib/ip';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Student marks attendance against the open session for their enrolled course.
//
// The mark is always recorded as 'pending' — the teacher then manually verifies
// the student is present and approves it (see /api/attendance/decide). The public
// IP match is captured only as a HINT for the teacher (ip_ok); it no longer gates
// the mark, because legitimate class networks can span IP ranges that differ from
// the teacher's. A mark placed after the marking window is flagged so approval
// counts it as 'late' instead of 'present'.
//
// Body: { network_ip }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentIp = effectiveIp(b.network_ip, request);
  const serverIp = getServerSeenIp(request);

  // Find an open session for a course this student is enrolled in.
  const { rows } = await query(
    `SELECT s.* FROM attendance_sessions s
       JOIN enrollments e ON e.offering_id = s.offering_id AND e.student_id = $1
      WHERE s.is_open = TRUE
      ORDER BY s.opened_at DESC LIMIT 1`,
    [user.id]
  );
  const session = rows[0];
  if (!session) {
    return NextResponse.json(
      { error: 'No open attendance session for your enrolled courses right now.' },
      { status: 404 }
    );
  }

  const now = new Date();
  // Null attendance_until = legacy session, treated as still within the window.
  const windowClosed = session.attendance_until && now > new Date(session.attendance_until);
  const ipOk = sameNetwork(studentIp, session.network_ip);

  const reason = windowClosed
    ? 'Marked after the window — pending teacher approval (counts as late if approved).'
    : 'Submitted — pending teacher approval.';

  // Record (or re-record) as 'pending'. If the teacher has already approved this
  // student (present/late), a re-tap must not silently downgrade that decision.
  const { rows: saved } = await query(
    `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_address, server_ip, ip_ok, reason)
     VALUES ($1,$2,'pending','student',$3,$4,$5,$6)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET
       status = CASE WHEN attendance.status IN ('present','late') THEN attendance.status ELSE 'pending' END,
       ip_address = EXCLUDED.ip_address, server_ip = EXCLUDED.server_ip,
       ip_ok = EXCLUDED.ip_ok, reason = EXCLUDED.reason, created_at = now()
     RETURNING *`,
    [session.id, user.id, studentIp, serverIp, ipOk, reason]
  );
  const record = saved[0];

  await audit(request, user.id, 'attendance.check_in', {
    sessionId: session.id, status: record.status, ipOk, late: !!windowClosed, studentIp,
  });

  return NextResponse.json(
    {
      status: record.status,
      pending: record.status === 'pending',
      late: !!windowClosed,
      ip_ok: ipOk,
      attendance: record,
    },
    { status: 201 }
  );
}
