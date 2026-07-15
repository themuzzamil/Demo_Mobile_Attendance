import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { effectiveIp, getServerSeenIp, sameNetwork } from '@/lib/ip';
import { verifyToken, verifyMessage, hashDevice } from '@/lib/qr';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Student marks attendance for the open session of a course they're enrolled in.
//
// Proof of presence is layered, so no single copied artefact is enough:
//   1. QR / code  — a signed token from the teacher's screen that rotates every
//                   10s, so a photographed code is dead before it can be shared.
//   2. Device     — the mark must come from the device bound to this account, and
//                   one device may not mark two students in the same session.
//   3. Network    — the public IP is compared with the teacher's (a soft signal).
//
// Outcome is risk-based, so the teacher isn't approving all 40 students by hand:
//   token OK + known device + IP match -> auto 'present' (or 'late' after window)
//   anything soft failing             -> 'pending', flagged with why, for the
//                                        teacher to confirm (the manual approval)
//   one device marking a 2nd student  -> rejected outright (proxy attempt)
//
// Body: { network_ip, token, device_id }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentIp = effectiveIp(b.network_ip, request);
  const serverIp = getServerSeenIp(request);
  const deviceHash = hashDevice(b.device_id);

  if (!deviceHash) {
    return NextResponse.json(
      { error: 'Could not identify this device. Reload the page and try again.' },
      { status: 400 }
    );
  }

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

  // 1. Rotating QR / code from the teacher's screen — required.
  const v = verifyToken(b.token, session.id);
  if (!v.ok) {
    await audit(request, user.id, 'attendance.check_in_rejected', {
      sessionId: session.id, reason: v.reason,
    });
    return NextResponse.json(
      { error: verifyMessage(v.reason), token_error: v.reason },
      { status: 403 }
    );
  }

  // 2a. Proxy guard: this device already marked a DIFFERENT student here.
  const clash = await query(
    `SELECT u.name FROM attendance a JOIN users u ON u.id = a.student_id
      WHERE a.session_id = $1 AND a.device_hash = $2 AND a.student_id <> $3 LIMIT 1`,
    [session.id, deviceHash, user.id]
  );
  if (clash.rowCount > 0) {
    await audit(request, user.id, 'attendance.check_in_rejected', {
      sessionId: session.id, reason: 'device_already_used',
    });
    return NextResponse.json(
      { error: 'This device has already marked attendance for another student in this class.' },
      { status: 403 }
    );
  }

  // 2b. Device binding: first mark binds the account to this device; later marks
  // from an unrecognised device are allowed but flagged for the teacher (a student
  // may genuinely have a new phone — an admin can reset the binding).
  const known = (await query('SELECT device_hash FROM users WHERE id = $1', [user.id])).rows[0]
    ?.device_hash;
  const deviceOk = !known || known === deviceHash;
  if (!known) {
    await query('UPDATE users SET device_hash = $1 WHERE id = $2 AND device_hash IS NULL', [
      deviceHash, user.id,
    ]);
  }

  // 3. Network signal.
  const now = new Date();
  const windowClosed = session.attendance_until && now > new Date(session.attendance_until);
  const ipOk = sameNetwork(studentIp, session.network_ip);

  // Risk-based outcome.
  const flags = [];
  if (!deviceOk) flags.push('unrecognised device');
  if (!ipOk) flags.push('not on the class network');

  const autoApproved = flags.length === 0;
  const markStatus = autoApproved ? (windowClosed ? 'late' : 'present') : 'pending';
  const reason = autoApproved
    ? windowClosed
      ? 'Verified by class QR — marked late (after the window).'
      : 'Verified by class QR, device and network.'
    : `Needs teacher check — ${flags.join(' and ')}.`;

  // A teacher's earlier approval must never be silently downgraded by a re-tap.
  const { rows: saved } = await query(
    `INSERT INTO attendance
       (session_id, student_id, status, attendee_role, ip_address, server_ip, ip_ok, reason, device_hash)
     VALUES ($1,$2,$3,'student',$4,$5,$6,$7,$8)
     ON CONFLICT (session_id, student_id)
     DO UPDATE SET
       status = CASE WHEN attendance.status IN ('present','late') THEN attendance.status
                     ELSE EXCLUDED.status END,
       ip_address = EXCLUDED.ip_address, server_ip = EXCLUDED.server_ip,
       ip_ok = EXCLUDED.ip_ok, reason = EXCLUDED.reason,
       device_hash = EXCLUDED.device_hash, created_at = now()
     RETURNING *`,
    [session.id, user.id, markStatus, studentIp, serverIp, ipOk, reason, deviceHash]
  );
  const record = saved[0];

  await audit(request, user.id, 'attendance.check_in', {
    sessionId: session.id, status: record.status, ipOk, deviceOk, late: !!windowClosed, studentIp,
  });

  return NextResponse.json(
    {
      status: record.status,
      pending: record.status === 'pending',
      auto_approved: autoApproved,
      late: !!windowClosed,
      ip_ok: ipOk,
      device_ok: deviceOk,
      flags,
      attendance: record,
    },
    { status: 201 }
  );
}
