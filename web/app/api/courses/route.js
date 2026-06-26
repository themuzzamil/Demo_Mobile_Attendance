import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// GET: the course catalog (admin + teacher can read it).
export async function GET(request) {
  const { error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const { rows } = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM course_offerings o WHERE o.course_id = c.id AND o.active) AS offering_count
       FROM courses c ORDER BY c.code`
  );
  return NextResponse.json({ courses: rows });
}

// POST (admin): add a course to the catalog. Body: { code, title, credit_hours? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const b = (await request.json().catch(() => ({}))) || {};
  const code = (b.code || '').trim().toUpperCase();
  const title = (b.title || '').trim();
  const credit = b.credit_hours ? Number(b.credit_hours) : null;
  if (!code || !title) {
    return NextResponse.json({ error: 'Course code and title are required' }, { status: 400 });
  }
  try {
    const { rows } = await query(
      `INSERT INTO courses (code, title, credit_hours, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [code, title, credit, user.id]
    );
    await audit(request, user.id, 'course.create', { courseId: rows[0].id, code });
    return NextResponse.json({ course: rows[0] }, { status: 201 });
  } catch (e) {
    if (e.code === '23505') return NextResponse.json({ error: `Course code ${code} already exists` }, { status: 409 });
    throw e;
  }
}
