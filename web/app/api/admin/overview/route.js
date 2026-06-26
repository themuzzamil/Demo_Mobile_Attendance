import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// GET (admin): oversight snapshot — totals, per-teacher rollup, recent sessions,
// and recent audit log entries.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const totals = await query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role='teacher' AND status='approved') AS teachers,
       (SELECT COUNT(*) FROM users WHERE role='student' AND status='approved') AS students,
       (SELECT COUNT(*) FROM classes WHERE active) AS classes,
       (SELECT COUNT(*) FROM attendance_sessions WHERE is_open) AS open_sessions,
       (SELECT COUNT(*) FROM permission_requests WHERE status='pending') AS pending_requests`
  );

  // Per-teacher rollup: how many classes, sessions run, and total student presents.
  const perTeacher = await query(
    `SELECT u.id, u.name, u.email,
            (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = u.id AND c.active) AS classes,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.teacher_id = u.id) AS sessions_run,
            (SELECT COUNT(*) FROM attendance a
               JOIN attendance_sessions s ON s.id = a.session_id
              WHERE s.teacher_id = u.id AND a.attendee_role='student' AND a.status IN ('present','late')
            ) AS total_present
       FROM users u
      WHERE u.role='teacher' AND u.status='approved'
      ORDER BY u.name`
  );

  // Recent sessions with attendance breakdown.
  const sessions = await query(
    `SELECT s.id, s.subject, s.semester, s.section, s.opened_at, s.closed_at, s.is_open,
            s.teacher_status, s.scheduled_start, s.attendance_until, u.name AS teacher_name,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id AND a.attendee_role='student' AND a.status='present') AS present,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id AND a.attendee_role='student' AND a.status='late') AS late,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id AND a.attendee_role='student' AND a.status='absent') AS absent,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id=s.id AND a.attendee_role='student' AND a.status='denied') AS denied
       FROM attendance_sessions s JOIN users u ON u.id = s.teacher_id
      ORDER BY s.opened_at DESC LIMIT 25`
  );

  const logs = await query(
    `SELECT l.id, l.action, l.details, l.ip_address, l.created_at, u.name AS user_name, u.role AS user_role
       FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC LIMIT 50`
  );

  return NextResponse.json({
    totals: totals.rows[0],
    per_teacher: perTeacher.rows,
    sessions: sessions.rows,
    logs: logs.rows,
  });
}
