import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { dayName } from '@/lib/schedule';

export const runtime = 'nodejs';

// GET (student): the student's weekly schedule, derived from enrolled offerings.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const { rows } = await query(
    `SELECT t.id AS slot_id, t.day_of_week, t.start_time, t.duration_minutes,
            c.code, c.title, o.section, o.term, u.name AS teacher_name
       FROM enrollments e
       JOIN timetable_slots t ON t.offering_id = e.offering_id AND t.active
       JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN users u ON u.id = t.teacher_id
      WHERE e.student_id = $1
      ORDER BY t.day_of_week, t.start_time`,
    [user.id]
  );
  return NextResponse.json({ slots: rows.map((r) => ({ ...r, day_name: dayName(r.day_of_week) })) });
}
