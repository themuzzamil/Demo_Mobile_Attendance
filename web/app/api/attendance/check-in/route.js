import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { trustedIp, getServerSeenIp, sameNetwork } from '@/lib/ip';
import { verifyToken, verifyMessage, hashDevice } from '@/lib/qr';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Student marks attendance for the open session of a course they're enrolled in.
//
// Proof of presence is layered, so no single copied artefact is enough:
//   1. Network — the student's public IP MUST equal the class network IP. This is
//                a hard gate: off-network is rejected outright, no row is written
//                and no teacher can override it.
//   2. QR/code — a signed token from the teacher's screen that rotates every 10s,
//                so a photographed code is dead before it can be shared.
//   3. Device  — the mark must come from the device bound to this account, and
//                one device may not mark two students in the same session.
//
// Outcomes:
//   off-network / bad token          -> 403, nothing recorded
//   one device marking a 2nd student -> 403 (proxy attempt)
//   all pass + known device          -> 'present' (or 'late' after the window)
//   all pass + unrecognised device   -> 'pending' for the teacher to confirm
//
// Body: { network_ip, token, device_id }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  // network_ip is a dev-only fallback; in production the platform decides.
  const studentIp = trustedIp(request, b.network_ip);
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

  // 1. Class network — a hard gate. Checked before anything is written, so an
  // off-network attempt leaves no attendance row for anyone to approve later.
  const ipOk = sameNetwork(studentIp, session.network_ip);
  if (!ipOk) {
    await audit(request, user.id, 'attendance.check_in_rejected', {
      sessionId: session.id, reason: 'off_network', studentIp,
    });
    return NextResponse.json(
      {
        error: 'You are not on the class network. Connect to the class Wi-Fi and try again.',
        off_network: true,
      },
      { status: 403 }
    );
  }

  // 2. Rotating QR / code from the teacher's screen — required.
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

  // 3a. Proxy guard: this device already marked a DIFFERENT student here.
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

  // 3b. Device binding: first mark binds the account to this device; later marks
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

  const now = new Date();
  const windowClosed = session.attendance_until && now > new Date(session.attendance_until);

  // Network and token are already proven by the gates above, so an unrecognised
  // device is the only thing left that still needs a human to look at.
  const flags = deviceOk ? [] : ['unrecognised device'];
  const autoApproved = deviceOk;
  const markStatus = autoApproved ? (windowClosed ? 'late' : 'present') : 'pending';
  const reason = autoApproved
    ? windowClosed
      ? 'Verified by class QR, device and network — marked late (after the window).'
      : 'Verified by class QR, device and network.'
    : 'Needs teacher check — marked from an unrecognised device.';

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
