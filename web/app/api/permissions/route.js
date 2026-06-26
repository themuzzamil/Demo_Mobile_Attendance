import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sendMessage, notifyAdmins } from '@/lib/messages';

export const runtime = 'nodejs';

// GET: list permission requests the caller can act on.
//   admin   -> teacher_late_start requests
//   teacher -> student_late_mark requests for the caller's sessions
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  let rows;
  if (user.role === 'admin') {
    ({ rows } = await query(
      `SELECT pr.*, u.name AS requester_name,
              (crs.code || ' — ' || crs.title) AS subject, t.start_time, t.day_of_week
         FROM permission_requests pr
         JOIN users u ON u.id = pr.requester_id
         LEFT JOIN timetable_slots t ON t.id = pr.slot_id
         LEFT JOIN course_offerings o ON o.id = t.offering_id
         LEFT JOIN courses crs ON crs.id = o.course_id
        WHERE pr.type = 'teacher_late_start'
        ORDER BY pr.status = 'pending' DESC, pr.created_at DESC LIMIT 100`
    ));
  } else {
    ({ rows } = await query(
      `SELECT pr.*, u.name AS requester_name, u.roll_no, s.subject
         FROM permission_requests pr
         JOIN users u ON u.id = pr.requester_id
         JOIN attendance_sessions s ON s.id = pr.session_id
        WHERE pr.type = 'student_late_mark' AND s.teacher_id = $1
        ORDER BY pr.status = 'pending' DESC, pr.created_at DESC LIMIT 100`,
      [user.id]
    ));
  }
  return NextResponse.json({ requests: rows });
}

// POST: raise a request.
//   student -> { type:'student_late_mark', session_id, reason? } (approver: that session's teacher)
//   teacher -> { type:'teacher_late_start', slot_id, reason? }   (approver: admins)
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'teacher', 'student');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const type = b.type;
  const reason = (b.reason || '').trim() || null;

  if (type === 'student_late_mark' && user.role === 'student') {
    const sessionId = Number(b.session_id);
    if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    const sRes = await query('SELECT * FROM attendance_sessions WHERE id = $1', [sessionId]);
    const session = sRes.rows[0];
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    // Avoid duplicate pending requests.
    const dup = await query(
      `SELECT id FROM permission_requests
        WHERE type='student_late_mark' AND requester_id=$1 AND session_id=$2 AND status='pending'`,
      [user.id, sessionId]
    );
    if (dup.rowCount > 0) {
      return NextResponse.json({ ok: true, request_id: dup.rows[0].id, duplicate: true }, { status: 200 });
    }

    const { rows } = await query(
      `INSERT INTO permission_requests (type, requester_id, session_id, reason)
       VALUES ('student_late_mark',$1,$2,$3) RETURNING *`,
      [user.id, sessionId, reason]
    );
    await sendMessage({
      toUserId: session.teacher_id,
      fromUserId: user.id,
      kind: 'student_late_mark',
      body: `${user.name} requests to mark ${session.subject} attendance late${reason ? `: ${reason}` : '.'}`,
      refId: rows[0].id,
    });
    await audit(request, user.id, 'permission.request', { type, sessionId });
    return NextResponse.json({ request: rows[0] }, { status: 201 });
  }

  if (type === 'teacher_late_start' && user.role === 'teacher') {
    const slotId = Number(b.slot_id);
    if (!slotId) return NextResponse.json({ error: 'slot_id is required' }, { status: 400 });
    const slotRes = await query(
      `SELECT t.*, (c.code || ' — ' || c.title) AS subject
         FROM timetable_slots t
         JOIN course_offerings o ON o.id = t.offering_id
         JOIN courses c ON c.id = o.course_id
        WHERE t.id = $1`,
      [slotId]
    );
    const slot = slotRes.rows[0];
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    if (slot.teacher_id !== user.id) {
      return NextResponse.json({ error: 'This class is not assigned to you' }, { status: 403 });
    }

    const dup = await query(
      `SELECT id FROM permission_requests
        WHERE type='teacher_late_start' AND requester_id=$1 AND slot_id=$2 AND status='pending'`,
      [user.id, slotId]
    );
    if (dup.rowCount > 0) {
      return NextResponse.json({ ok: true, request_id: dup.rows[0].id, duplicate: true }, { status: 200 });
    }

    const { rows } = await query(
      `INSERT INTO permission_requests (type, requester_id, slot_id, reason)
       VALUES ('teacher_late_start',$1,$2,$3) RETURNING *`,
      [user.id, slotId, reason]
    );
    await notifyAdmins({
      fromUserId: user.id,
      kind: 'teacher_late_start',
      body: `${user.name} requests permission to start ${slot.subject} late${reason ? `: ${reason}` : '.'}`,
      refId: rows[0].id,
    });
    await audit(request, user.id, 'permission.request', { type, slotId });
    return NextResponse.json({ request: rows[0] }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid request type for your role' }, { status: 400 });
}
