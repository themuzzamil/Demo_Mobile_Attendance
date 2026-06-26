import { query } from './db.js';

// Mark every enrolled student who never marked (no attendance row) as 'absent'
// for a session, using the session's course offering roster. Returns the number
// of absentees inserted.
export async function sweepAbsentees(session) {
  if (!session?.offering_id) return 0;
  const { rowCount } = await query(
    `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_ok, reason)
     SELECT $1, e.student_id, 'absent', 'student', FALSE, 'Auto-marked absent at lecture end'
       FROM enrollments e
      WHERE e.offering_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
           WHERE a.session_id = $1 AND a.student_id = e.student_id
        )
     ON CONFLICT (session_id, student_id) DO NOTHING`,
    [session.id, session.offering_id]
  );
  return rowCount;
}
