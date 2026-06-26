import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Admin, or the class's own teacher, may manage the roster.
async function loadClassFor(user, classId) {
  const { rows } = await query('SELECT * FROM classes WHERE id = $1', [classId]);
  const klass = rows[0];
  if (!klass) return { error: 'Class not found', status: 404 };
  if (user.role === 'teacher' && klass.teacher_id !== user.id) {
    return { error: 'Not your class', status: 403 };
  }
  return { klass };
}

// GET: list enrolled students for a class.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const classId = Number(params.id);
  const ctx = await loadClassFor(user, classId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.roll_no, u.semester, u.section
       FROM enrollments e JOIN users u ON u.id = e.student_id
      WHERE e.class_id = $1 ORDER BY u.roll_no, u.name`,
    [classId]
  );
  return NextResponse.json({ students: rows });
}

// POST: enroll a student. Body: { student_id }
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const classId = Number(params.id);
  const ctx = await loadClassFor(user, classId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentId = Number(b.student_id);
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  const s = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'student'", [studentId]);
  if (s.rowCount === 0) {
    return NextResponse.json({ error: 'student_id is not a valid student' }, { status: 400 });
  }

  await query(
    `INSERT INTO enrollments (class_id, student_id) VALUES ($1,$2)
     ON CONFLICT (class_id, student_id) DO NOTHING`,
    [classId, studentId]
  );
  await audit(request, user.id, 'enrollment.add', { classId, studentId });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE: unenroll a student. Body: { student_id }
export async function DELETE(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const classId = Number(params.id);
  const ctx = await loadClassFor(user, classId);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const b = (await request.json().catch(() => ({}))) || {};
  const studentId = Number(b.student_id);
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  await query('DELETE FROM enrollments WHERE class_id = $1 AND student_id = $2', [classId, studentId]);
  await audit(request, user.id, 'enrollment.remove', { classId, studentId });
  return NextResponse.json({ ok: true });
}
