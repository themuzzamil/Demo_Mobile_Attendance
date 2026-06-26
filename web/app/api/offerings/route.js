import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// GET: course offerings (admin: all; teacher: their own) with course + roster size.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const params = [];
  let where = 'WHERE o.active = TRUE';
  if (user.role === 'teacher') { params.push(user.id); where += ` AND o.teacher_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT o.*, c.code, c.title, u.name AS teacher_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.offering_id = o.id) AS student_count
       FROM course_offerings o
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN users u ON u.id = o.teacher_id
       ${where}
      ORDER BY o.term DESC, c.code, o.section`,
    params
  );
  return NextResponse.json({ offerings: rows });
}

// POST (admin): create an offering (a teacher teaching a course-section in a term).
// Body: { course_id, teacher_id, term, semester?, section? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const b = (await request.json().catch(() => ({}))) || {};
  const courseId = Number(b.course_id);
  const teacherId = b.teacher_id ? Number(b.teacher_id) : null;
  const term = (b.term || '').trim();
  const semester = (b.semester || '').trim() || null;
  const section = (b.section || '').trim() || null;
  if (!courseId || !term) {
    return NextResponse.json({ error: 'course_id and term are required' }, { status: 400 });
  }
  const course = await query('SELECT 1 FROM courses WHERE id = $1', [courseId]);
  if (course.rowCount === 0) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  if (teacherId) {
    const t = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);
    if (t.rowCount === 0) return NextResponse.json({ error: 'teacher_id is not a valid teacher' }, { status: 400 });
  }
  try {
    const { rows } = await query(
      `INSERT INTO course_offerings (course_id, teacher_id, term, semester, section, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [courseId, teacherId, term, semester, section, user.id]
    );
    await audit(request, user.id, 'offering.create', { offeringId: rows[0].id, courseId, term, section });
    return NextResponse.json({ offering: rows[0] }, { status: 201 });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json({ error: 'This course already has an offering for that section + term' }, { status: 409 });
    }
    throw e;
  }
}
