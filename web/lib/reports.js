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

// --- Class attendance reports ------------------------------------------------
// Per-course roster views with student names + IDs. Scoped by role:
//   teacher -> only their own offerings; admin -> every offering.

// List of classes (offerings) the caller may report on, with headline counts.
export async function fetchClassList(user) {
  const where = [];
  const values = [];
  if (user.role === 'teacher') { values.push(user.id); where.push(`o.teacher_id = $1`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT o.id AS offering_id, c.code, c.title, o.section, o.term, o.semester,
            o.teacher_id, t.name AS teacher_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.id)::int AS enrolled_count,
            (SELECT COUNT(*) FROM attendance_sessions s WHERE s.offering_id = o.id)::int AS sessions_held
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN users t ON t.id = o.teacher_id
       ${clause}
      ORDER BY c.code, o.section NULLS FIRST, o.term`,
    values
  );
  return rows;
}

// Verify the caller may view this offering. Returns the offering row or null.
async function offeringForUser(user, offeringId) {
  const { rows } = await query(
    `SELECT o.id, o.teacher_id, o.section, o.term, o.semester,
            c.code, c.title, t.name AS teacher_name
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN users t ON t.id = o.teacher_id
      WHERE o.id = $1`,
    [offeringId]
  );
  const o = rows[0];
  if (!o) return null;
  if (user.role === 'teacher' && o.teacher_id !== user.id) return null;
  return o;
}

// Full report for one offering: the enrolled roster with per-student totals +
// attendance %, and the list of sessions held with their status breakdown.
export async function fetchOfferingReport(user, offeringId) {
  const offering = await offeringForUser(user, offeringId);
  if (!offering) return null;

  const held = (
    await query(
      `SELECT COUNT(*)::int AS n FROM attendance_sessions WHERE offering_id = $1`,
      [offeringId]
    )
  ).rows[0].n;

  const roster = (
    await query(
      `SELECT u.id AS student_id, u.name, u.roll_no, u.section, u.semester,
              COUNT(a.id) FILTER (WHERE a.status = 'present')::int AS present,
              COUNT(a.id) FILTER (WHERE a.status = 'late')::int    AS late,
              COUNT(a.id) FILTER (WHERE a.status = 'absent')::int  AS absent,
              COUNT(a.id) FILTER (WHERE a.status = 'denied')::int  AS denied,
              COUNT(a.id) FILTER (WHERE a.status = 'pending')::int AS pending
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance a
           ON a.student_id = u.id AND a.attendee_role = 'student'
          AND a.session_id IN (SELECT id FROM attendance_sessions WHERE offering_id = $1)
        WHERE e.offering_id = $1
        GROUP BY u.id
        ORDER BY u.roll_no NULLS LAST, u.name`,
      [offeringId]
    )
  ).rows.map((r) => ({
    ...r,
    held,
    percentage: held > 0 ? Math.round(((r.present + r.late) / held) * 100) : null,
  }));

  const sessions = (
    await query(
      `SELECT s.id, s.opened_at, s.closed_at, s.is_open, s.scheduled_start, s.teacher_status,
              COUNT(a.id) FILTER (WHERE a.status = 'present' AND a.attendee_role = 'student')::int AS present,
              COUNT(a.id) FILTER (WHERE a.status = 'late' AND a.attendee_role = 'student')::int    AS late,
              COUNT(a.id) FILTER (WHERE a.status = 'absent' AND a.attendee_role = 'student')::int  AS absent,
              COUNT(a.id) FILTER (WHERE a.status = 'denied' AND a.attendee_role = 'student')::int  AS denied,
              COUNT(a.id) FILTER (WHERE a.status = 'pending' AND a.attendee_role = 'student')::int AS pending
         FROM attendance_sessions s
         LEFT JOIN attendance a ON a.session_id = s.id
        WHERE s.offering_id = $1
        GROUP BY s.id
        ORDER BY s.opened_at DESC`,
      [offeringId]
    )
  ).rows;

  return { offering, enrolled_count: roster.length, sessions_held: held, roster, sessions };
}

// One class meeting (session): every enrolled student and how they stood for it —
// present / late / absent / pending / denied / not_marked — with names + roll IDs.
export async function fetchSessionReport(user, sessionId) {
  const sRes = await query(
    `SELECT s.id, s.offering_id, s.teacher_id, s.subject, s.section, s.opened_at,
            s.closed_at, s.is_open, s.scheduled_start, s.attendance_until, s.teacher_status,
            t.name AS teacher_name, c.code, c.title
       FROM attendance_sessions s
       LEFT JOIN users t ON t.id = s.teacher_id
       LEFT JOIN course_offerings o ON o.id = s.offering_id
       LEFT JOIN courses c ON c.id = o.course_id
      WHERE s.id = $1`,
    [sessionId]
  );
  const session = sRes.rows[0];
  if (!session) return null;
  if (user.role === 'teacher' && session.teacher_id !== user.id) return null;

  const students = (
    await query(
      `SELECT u.id AS student_id, u.name, u.roll_no, u.section,
              COALESCE(a.status, 'not_marked') AS status,
              a.id AS attendance_id, a.ip_ok, a.ip_address, a.created_at, a.reason
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance a
           ON a.session_id = $1 AND a.student_id = u.id AND a.attendee_role = 'student'
        WHERE e.offering_id = $2
        ORDER BY u.roll_no NULLS LAST, u.name`,
      [sessionId, session.offering_id]
    )
  ).rows;

  return { session, students };
}
