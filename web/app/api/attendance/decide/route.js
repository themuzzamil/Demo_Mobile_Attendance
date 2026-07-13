import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Teacher (or admin) approves / rejects student attendance marks.
//   approve -> 'present', or 'late' if the mark was placed after the window
//   reject  -> 'denied'
// A teacher may only decide marks in their own sessions; an admin may decide any.
//
// Body (one of):
//   { id, decision }                       — a single attendance record
//   { session_id, all: true, decision }    — every pending mark in a session
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const decision = b.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  // Final status expression (safe, fixed SQL — no user input interpolated).
  const setStatus =
    decision === 'approve'
      ? `CASE WHEN s.attendance_until IS NOT NULL AND a.created_at > s.attendance_until THEN 'late' ELSE 'present' END`
      : `'denied'`;
  const reasonText = decision === 'approve' ? 'Approved by teacher' : 'Rejected by teacher';

  const params = [user.id]; // $1 = decider id
  let target;
  if (b.session_id && b.all) {
    params.push(Number(b.session_id)); // $2
    target = `a.session_id = $2 AND a.status = 'pending'`;
  } else if (b.id) {
    params.push(Number(b.id)); // $2
    target = `a.id = $2`;
  } else {
    return NextResponse.json(
      { error: 'Provide { id } or { session_id, all: true }.' },
      { status: 400 }
    );
  }

  // Teachers are scoped to their own sessions; admins are not.
  let scope = '';
  if (user.role !== 'admin') {
    params.push(user.id);
    scope = ` AND s.teacher_id = $${params.length}`;
  }

  const { rows } = await query(
    `UPDATE attendance a
        SET status = ${setStatus}, approved_by = $1, decided_at = now(), reason = '${reasonText}'
       FROM attendance_sessions s
      WHERE a.session_id = s.id AND a.attendee_role = 'student' AND ${target}${scope}
      RETURNING a.id, a.student_id, a.status`,
    params
  );

  if (rows.length === 0 && b.id) {
    return NextResponse.json(
      { error: 'Record not found, or not in one of your sessions.' },
      { status: 404 }
    );
  }

  await audit(request, user.id, 'attendance.decide', {
    decision,
    count: rows.length,
    ...(b.id ? { id: Number(b.id) } : { session_id: Number(b.session_id), all: true }),
  });

  return NextResponse.json({ ok: true, decided: rows.length, records: rows });
}
