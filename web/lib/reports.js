import { query } from './db.js';

// Fetch attendance rows for reports, scoped by role.
// teacher -> own sessions; admin -> all. Filters: session_id, status, subject.
export async function fetchRecords(user, searchParams) {
  const where = [];
  const values = [];
  let i = 1;
  if (user.role === 'teacher') { where.push(`s.teacher_id = $${i++}`); values.push(user.id); }
  const sessionId = searchParams.get('session_id');
  const st = searchParams.get('status');
  const subject = searchParams.get('subject');
  if (sessionId) { where.push(`a.session_id = $${i++}`); values.push(sessionId); }
  if (st) { where.push(`a.status = $${i++}`); values.push(st); }
  if (subject) { where.push(`s.subject = $${i++}`); values.push(subject); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT a.id, u.name AS student_name, u.roll_no, u.semester, u.section,
            s.subject, t.name AS teacher_name,
            a.status, a.ip_address, a.ip_ok, a.reason, a.created_at
       FROM attendance a
       JOIN attendance_sessions s ON s.id = a.session_id
       JOIN users u ON u.id = a.student_id
       JOIN users t ON t.id = s.teacher_id
       ${clause}
      ORDER BY a.created_at DESC LIMIT 5000`,
    values
  );
  return rows;
}
