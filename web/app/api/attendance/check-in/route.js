import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { effectiveIp, getServerSeenIp, sameNetwork } from '@/lib/ip';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Student marks attendance against the open session for their subject.
// Rules:
//   - present only if their public IP matches the teacher's captured network IP;
//   - the marking window (attendance_until) is enforced server-side: after it
//     closes, the student needs a teacher-approved (single-use) late-mark
//     permission, which then counts as present.
// Body: { network_ip }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentIp = effectiveIp(b.network_ip, request);
  const serverIp = getServerSeenIp(request);

  const { rows } = await query(
    `SELECT * FROM attendance_sessions
      WHERE is_open = TRUE AND subject = $1
      ORDER BY opened_at DESC LIMIT 1`,
    [user.subject]
  );
  const session = rows[0];
  if (!session) {
    return NextResponse.json(
      { error: 'No open attendance session for your subject right now.' },
      { status: 404 }
    );
  }

  // Window check (server-side). Null attendance_until = legacy session, no cutoff.
  const now = new Date();
  const windowClosed = session.attendance_until && now > new Date(session.attendance_until);

  if (windowClosed) {
    // Need a teacher-approved, unused late-mark permission for this session.
    const perm = await query(
      `SELECT id FROM permission_requests
        WHERE type = 'student_late_mark' AND requester_id = $1 AND session_id = $2
          AND status = 'approved' ORDER BY id DESC LIMIT 1`,
      [user.id, session.id]
    );
    if (perm.rowCount === 0) {
      return NextResponse.json(
        {
          error: 'Marking window closed. Request permission from your teacher to mark late.',
          window_closed: true,
          needs_permission: true,
        },
        { status: 403 }
      );
    }
    // Teacher-approved late mark still requires being on the class network.
    const lateIpOk = sameNetwork(studentIp, session.network_ip);
    if (!lateIpOk) {
      return NextResponse.json(
        { error: 'You are not on the class network. Connect to the class Wi-Fi and retry.' },
        { status: 403 }
      );
    }
    const { rows: saved } = await query(
      `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_address, server_ip, ip_ok, reason)
       VALUES ($1,$2,'present','student',$3,$4,TRUE,'Late mark approved by teacher')
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET status = 'present', ip_address = EXCLUDED.ip_address,
                     server_ip = EXCLUDED.server_ip, ip_ok = TRUE,
                     reason = EXCLUDED.reason, created_at = now()
       RETURNING *`,
      [session.id, user.id, studentIp, serverIp]
    );
    await query("UPDATE permission_requests SET status = 'used' WHERE id = $1", [perm.rows[0].id]);
    await audit(request, user.id, 'attendance.check_in', {
      sessionId: session.id, status: 'present', late: true, studentIp,
    });
    return NextResponse.json({ status: 'present', late: true, attendance: saved[0] }, { status: 201 });
  }

  // Within the window: normal IP-verified mark.
  const ipOk = sameNetwork(studentIp, session.network_ip);
  const markStatus = ipOk ? 'present' : 'denied';
  const reason = ipOk
    ? null
    : 'You are not on the same network as the class. Connect to the class Wi-Fi and retry.';

  const { rows: saved } = await query(
    `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_address, server_ip, ip_ok, reason)
     VALUES ($1,$2,$3,'student',$4,$5,$6,$7)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET status = EXCLUDED.status, ip_address = EXCLUDED.ip_address,
                   server_ip = EXCLUDED.server_ip, ip_ok = EXCLUDED.ip_ok,
                   reason = EXCLUDED.reason, created_at = now()
     RETURNING *`,
    [session.id, user.id, markStatus, studentIp, serverIp, ipOk, reason]
  );

  await audit(request, user.id, 'attendance.check_in', {
    sessionId: session.id, status: markStatus, studentIp, teacherIp: session.network_ip,
  });

  const record = saved[0];
  if (!ipOk) {
    return NextResponse.json({ status: 'denied', reason, attendance: record }, { status: 403 });
  }
  return NextResponse.json({ status: 'present', attendance: record }, { status: 201 });
}
