import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// GET: list classes (admin: all; teacher: their own) with teacher name + roster size.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const params = [];
  let where = 'WHERE c.active = TRUE';
  if (user.role === 'teacher') {
    params.push(user.id);
    where += ` AND c.teacher_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT c.*, u.name AS teacher_name,
            (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS student_count
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       ${where}
      ORDER BY c.subject, c.semester, c.section`,
    params
  );
  return NextResponse.json({ classes: rows });
}

// POST (admin): create a class. Body: { subject, semester?, section?, teacher_id }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const subject = (b.subject || '').trim();
  const semester = (b.semester || '').trim() || null;
  const section = (b.section || '').trim() || null;
  const teacherId = b.teacher_id ? Number(b.teacher_id) : null;
  if (!subject) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  }
  if (teacherId) {
    const t = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);
    if (t.rowCount === 0) {
      return NextResponse.json({ error: 'teacher_id is not a valid teacher' }, { status: 400 });
    }
  }

  try {
    const { rows } = await query(
      `INSERT INTO classes (subject, semester, section, teacher_id, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [subject, semester, section, teacherId, user.id]
    );
    await audit(request, user.id, 'class.create', { classId: rows[0].id, subject });
    return NextResponse.json({ class: rows[0] }, { status: 201 });
  } catch (e) {
    if (e.code === '23505') {
      return NextResponse.json(
        { error: 'A class with this subject/semester/section already exists' },
        { status: 409 }
      );
    }
    throw e;
  }
}
