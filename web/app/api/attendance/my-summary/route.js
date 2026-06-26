import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// GET (student): per-course attendance — classes held, attended (present+late),
// late, absent, and attendance percentage, for each enrolled offering.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'student');
  if (error) return NextResponse.json({ error }, { status });

  const { rows } = await query(
    `SELECT o.id AS offering_id, c.code, c.title, o.section, o.term,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id) AS held,
            (SELECT COUNT(*) FROM attendance a JOIN attendance_sessions s ON s.id = a.session_id
              WHERE s.offering_id = o.id AND a.student_id = $1 AND a.attendee_role = 'student'
                AND a.status IN ('present','late')) AS attended,
            (SELECT COUNT(*) FROM attendance a JOIN attendance_sessions s ON s.id = a.session_id
              WHERE s.offering_id = o.id AND a.student_id = $1 AND a.attendee_role = 'student'
                AND a.status = 'late') AS late,
            (SELECT COUNT(*) FROM attendance a JOIN attendance_sessions s ON s.id = a.session_id
              WHERE s.offering_id = o.id AND a.student_id = $1 AND a.attendee_role = 'student'
                AND a.status = 'absent') AS absent
       FROM enrollments e
       JOIN course_offerings o ON o.id = e.offering_id
       JOIN courses c ON c.id = o.course_id
      WHERE e.student_id = $1
      ORDER BY c.code`,
    [user.id]
  );

  const courses = rows.map((r) => {
    const held = Number(r.held);
    const attended = Number(r.attended);
    return {
      offering_id: r.offering_id,
      code: r.code,
      title: r.title,
      section: r.section,
      term: r.term,
      held,
      attended,
      late: Number(r.late),
      absent: Number(r.absent),
      percentage: held > 0 ? Math.round((attended / held) * 100) : null,
    };
  });
  return NextResponse.json({ courses });
}
