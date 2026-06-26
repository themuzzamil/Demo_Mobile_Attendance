import { query } from './db.js';

// Mark every enrolled student who never marked (no present/late row) as 'absent'
// for a session. Requires the session to come from a timetable slot (so we can
// resolve its class roster). Returns the number of absentees inserted.
export async function sweepAbsentees(session) {
  if (!session?.slot_id) return 0;
  const cls = await query('SELECT class_id FROM timetable_slots WHERE id = $1', [session.slot_id]);
  const classId = cls.rows[0]?.class_id;
  if (!classId) return 0;

  const { rowCount } = await query(
    `INSERT INTO attendance (session_id, student_id, status, attendee_role, ip_ok, reason)
     SELECT $1, e.student_id, 'absent', 'student', FALSE, 'Auto-marked absent at lecture end'
       FROM enrollments e
      WHERE e.class_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
           WHERE a.session_id = $1 AND a.student_id = e.student_id
        )
     ON CONFLICT (session_id, student_id) DO NOTHING`,
    [session.id, classId]
  );
  return rowCount;
}
