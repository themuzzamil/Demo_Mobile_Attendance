import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { dayOfWeek, dayName, teacherStartState } from '@/lib/schedule';

export const runtime = 'nodejs';

// GET (teacher): today's slots with live start-eligibility.
// For each slot: scheduled times, start state (on_time/too_early/needs_permission),
// whether a session is already open, and whether an admin has granted a late-start.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const now = new Date();
  const dow = dayOfWeek(now);
  const { rows: slots } = await query(
    `SELECT t.*, c.subject, c.semester, c.section
       FROM timetable_slots t JOIN classes c ON c.id = t.class_id
      WHERE t.active = TRUE AND t.teacher_id = $1 AND t.day_of_week = $2
      ORDER BY t.start_time`,
    [user.id, dow]
  );

  const out = [];
  for (const slot of slots) {
    const { state, scheduledStart, graceEnd, endsAt } = teacherStartState(slot, now);

    // Already-open session started from this slot today?
    const open = await query(
      `SELECT id, opened_at, attendance_until, teacher_status FROM attendance_sessions
        WHERE slot_id = $1 AND is_open = TRUE ORDER BY opened_at DESC LIMIT 1`,
      [slot.id]
    );

    // Outstanding approved (unused) admin permission to start late?
    const perm = await query(
      `SELECT id FROM permission_requests
        WHERE type = 'teacher_late_start' AND requester_id = $1 AND slot_id = $2
          AND status = 'approved' ORDER BY id DESC LIMIT 1`,
      [user.id, slot.id]
    );

    out.push({
      slot_id: slot.id,
      subject: slot.subject,
      semester: slot.semester,
      section: slot.section,
      day_name: dayName(slot.day_of_week),
      start_time: slot.start_time,
      duration_minutes: slot.duration_minutes,
      mark_window_minutes: slot.mark_window_minutes,
      start_grace_minutes: slot.start_grace_minutes,
      scheduled_start: scheduledStart,
      grace_end: graceEnd,
      ends_at: endsAt,
      start_state: state,
      can_start: state === 'on_time' || (state === 'needs_permission' && perm.rowCount > 0),
      approved_permission_id: perm.rows[0]?.id || null,
      open_session: open.rows[0] || null,
    });
  }
  return NextResponse.json({ today: dayName(dow), slots: out });
}
