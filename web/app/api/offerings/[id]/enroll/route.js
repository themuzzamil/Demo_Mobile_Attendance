import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Admin, or the offering's own teacher, may manage the roster.
async function loadOfferingFor(user, offeringId) {
  const { rows } = await query('SELECT * FROM course_offerings WHERE id = $1', [offeringId]);
  const off = rows[0];
  if (!off) return { error: 'Offering not found', status: 404 };
  if (user.role === 'teacher' && off.teacher_id !== user.id) return { error: 'Not your offering', status: 403 };
  return { off };
}

// GET: enrolled students for an offering.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const id = Number(params.id);
  const ctx = await loadOfferingFor(user, id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.roll_no, u.semester, u.section
       FROM enrollments e JOIN users u ON u.id = e.student_id
      WHERE e.offering_id = $1 ORDER BY u.roll_no, u.name`,
    [id]
  );
  return NextResponse.json({ students: rows });
}

// POST: enroll. Body either:
//   { student_id }                 -> single student
//   { bulk: true, semester, section } -> all approved students matching semester+section
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const id = Number(params.id);
  const ctx = await loadOfferingFor(user, id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const b = (await request.json().catch(() => ({}))) || {};

  if (b.bulk) {
    const semester = (b.semester || '').trim();
    const section = (b.section || '').trim();
    if (!semester && !section) {
      return NextResponse.json({ error: 'Provide semester and/or section for bulk enroll' }, { status: 400 });
    }
    const conds = ["role = 'student'", "status = 'approved'"];
    const args = [];
    if (semester) { args.push(semester); conds.push(`semester = $${args.length}`); }
    if (section) { args.push(section); conds.push(`section = $${args.length}`); }
    const r = await query(
      `INSERT INTO enrollments (offering_id, student_id)
       SELECT $${args.length + 1}, u.id FROM users u WHERE ${conds.join(' AND ')}
       ON CONFLICT (offering_id, student_id) DO NOTHING`,
      [...args, id]
    );
    await audit(request, user.id, 'enrollment.bulk', { offeringId: id, semester, section, added: r.rowCount });
    return NextResponse.json({ ok: true, added: r.rowCount }, { status: 201 });
  }

  const studentId = Number(b.student_id);
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  const s = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'student'", [studentId]);
  if (s.rowCount === 0) return NextResponse.json({ error: 'student_id is not a valid student' }, { status: 400 });
  await query(
    `INSERT INTO enrollments (offering_id, student_id) VALUES ($1,$2)
     ON CONFLICT (offering_id, student_id) DO NOTHING`,
    [id, studentId]
  );
  await audit(request, user.id, 'enrollment.add', { offeringId: id, studentId });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE: unenroll a student. Body: { student_id }
export async function DELETE(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const id = Number(params.id);
  const ctx = await loadOfferingFor(user, id);
  if (ctx.error) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const b = (await request.json().catch(() => ({}))) || {};
  const studentId = Number(b.student_id);
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  await query('DELETE FROM enrollments WHERE offering_id = $1 AND student_id = $2', [id, studentId]);
  await audit(request, user.id, 'enrollment.remove', { offeringId: id, studentId });
  return NextResponse.json({ ok: true });
}
