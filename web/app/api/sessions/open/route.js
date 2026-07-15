import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { trustedIp, getServerSeenIp } from '@/lib/ip';
import { audit } from '@/lib/audit';
import { teacherStartState, attendanceUntil } from '@/lib/schedule';

export const runtime = 'nodejs';

// Teacher starts the class for one of their timetable slots. Starting the class
// IS the teacher's own attendance. The teacher's public IP becomes the reference
// network; the student marking window opens for mark_window_minutes.
//
// Body: { slot_id, network_ip }
// Grace rules (server-side, UTC):
//   on_time          -> start, teacher present
//   too_early        -> 400
//   needs_permission -> requires an approved (unused) admin permission, then late
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const slotId = Number(b.slot_id);
  if (!slotId) return NextResponse.json({ error: 'slot_id is required' }, { status: 400 });

  const slotRes = await query(
    `SELECT t.*, c.code, c.title, (c.code || ' — ' || c.title) AS subject, o.section, o.semester, o.id AS offering_id
       FROM timetable_slots t
       JOIN course_offerings o ON o.id = t.offering_id
       JOIN courses c ON c.id = o.course_id
      WHERE t.id = $1 AND t.active = TRUE`,
    [slotId]
  );
  const slot = slotRes.rows[0];
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  if (slot.teacher_id !== user.id) {
    return NextResponse.json({ error: 'This class is not assigned to you' }, { status: 403 });
  }

  // The captured reference network must be the IP the platform actually sees, not
  // one the caller supplies — otherwise the whole class check could be pointed at
  // an arbitrary network. network_ip is only a fallback for local dev.
  const networkIp = trustedIp(request, b.network_ip);
  if (!networkIp) {
    return NextResponse.json(
      { error: 'Could not determine your network IP. Check your connection and retry.' },
      { status: 400 }
    );
  }

  const now = new Date();
  const { state, scheduledStart, endsAt } = teacherStartState(slot, now);

  if (state === 'too_early') {
    return NextResponse.json(
      { error: 'Too early — you can start this class around its scheduled time.', start_state: state },
      { status: 403 }
    );
  }

  let teacherStatus = 'present';
  let usedPermissionId = null;
  if (state === 'needs_permission') {
    const perm = await query(
      `SELECT id FROM permission_requests
        WHERE type = 'teacher_late_start' AND requester_id = $1 AND slot_id = $2
          AND status = 'approved' ORDER BY id DESC LIMIT 1`,
      [user.id, slotId]
    );
    if (perm.rowCount === 0) {
      return NextResponse.json(
        {
          error: 'Grace period passed. Request permission from an admin to start this class.',
          start_state: state,
          needs_permission: true,
        },
        { status: 403 }
      );
    }
    usedPermissionId = perm.rows[0].id;
    teacherStatus = 'late';
  }

  // Only one open session per teacher: close any existing open ones first.
  await query(
    `UPDATE attendance_sessions SET is_open = FALSE, closed_at = now()
      WHERE teacher_id = $1 AND is_open = TRUE`,
    [user.id]
  );

  const until = attendanceUntil(slot, now);
  const { rows } = await query(
    `INSERT INTO attendance_sessions
       (teacher_id, subject, semester, section, network_ip, server_ip,
        slot_id, offering_id, scheduled_start, attendance_until, ends_at, teacher_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [user.id, slot.subject, slot.semester, slot.section, networkIp, getServerSeenIp(request),
     slotId, slot.offering_id, scheduledStart, until, endsAt, teacherStatus]
  );
  const session = rows[0];

  // Record the teacher's own attendance for this session.
  await query(
    `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_address, server_ip, ip_ok)
     VALUES ($1,$2,$3,'teacher',$4,$5,TRUE)
     ON CONFLICT (session_id, student_id) DO NOTHING`,
    [session.id, user.id, teacherStatus, networkIp, getServerSeenIp(request)]
  );

  // Consume the single-use admin permission, if one was used.
  if (usedPermissionId) {
    await query("UPDATE permission_requests SET status = 'used' WHERE id = $1", [usedPermissionId]);
  }

  await audit(request, user.id, 'session.open', {
    sessionId: session.id, slotId, networkIp, teacherStatus,
  });
  return NextResponse.json({ session, teacher_status: teacherStatus }, { status: 201 });
}
