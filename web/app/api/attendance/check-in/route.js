import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { effectiveIp, getServerSeenIp, sameNetwork } from '@/lib/ip';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Student marks attendance against the open session for their subject.
// Present only if their public IP matches the teacher's captured network IP.
// Body: { network_ip (student's client-detected public IP) }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentIp = effectiveIp(b.network_ip, request);
  const serverIp = getServerSeenIp(request);

  // Find the open session for this student's subject.
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

  const ipOk = sameNetwork(studentIp, session.network_ip);
  const markStatus = ipOk ? 'present' : 'denied';
  const reason = ipOk
    ? null
    : 'You are not on the same network as the class. Connect to the class Wi-Fi and retry.';

  // One record per student per session (re-attempts update the existing row).
  const { rows: saved } = await query(
    `INSERT INTO attendance (session_id, student_id, status, ip_address, server_ip, ip_ok, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET status = EXCLUDED.status, ip_address = EXCLUDED.ip_address,
                   server_ip = EXCLUDED.server_ip, ip_ok = EXCLUDED.ip_ok,
                   reason = EXCLUDED.reason, created_at = now()
     RETURNING *`,
    [session.id, user.id, markStatus, studentIp, serverIp, ipOk, reason]
  );

  await audit(request, user.id, 'attendance.check_in', {
    sessionId: session.id,
    status: markStatus,
    studentIp,
    teacherIp: session.network_ip,
  });

  const record = saved[0];
  if (!ipOk) {
    return NextResponse.json({ status: 'denied', reason, attendance: record }, { status: 403 });
  }
  return NextResponse.json({ status: 'present', attendance: record }, { status: 201 });
}
