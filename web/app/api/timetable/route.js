import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { dayName } from '@/lib/schedule';

export const runtime = 'nodejs';

// GET: list timetable slots (admin: all; teacher: their own).
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const params = [];
  let where = 'WHERE t.active = TRUE';
  if (user.role === 'teacher') {
    params.push(user.id);
    where += ` AND t.teacher_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT t.*, c.subject, c.semester, c.section, u.name AS teacher_name
       FROM timetable_slots t
       JOIN classes c ON c.id = t.class_id
       LEFT JOIN users u ON u.id = t.teacher_id
       ${where}
      ORDER BY t.day_of_week, t.start_time`,
    params
  );
  return NextResponse.json({ slots: rows.map((r) => ({ ...r, day_name: dayName(r.day_of_week) })) });
}

// POST (admin): create a slot.
// Body: { class_id, day_of_week(0-6), start_time("HH:MM"),
//         duration_minutes?, mark_window_minutes?, start_grace_minutes? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const classId = Number(b.class_id);
  const dow = Number(b.day_of_week);
  const startTime = (b.start_time || '').trim();
  if (!classId || Number.isNaN(dow) || dow < 0 || dow > 6 || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    return NextResponse.json(
      { error: 'class_id, day_of_week (0-6) and start_time ("HH:MM") are required' },
      { status: 400 }
    );
  }
  const klass = await query('SELECT * FROM classes WHERE id = $1 AND active = TRUE', [classId]);
  if (klass.rowCount === 0) {
    return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  }
  if (!klass.rows[0].teacher_id) {
    return NextResponse.json({ error: 'Assign a teacher to the class first' }, { status: 400 });
  }

  const duration = Number(b.duration_minutes) > 0 ? Number(b.duration_minutes) : 60;
  const markWindow = Number(b.mark_window_minutes) > 0 ? Number(b.mark_window_minutes) : 15;
  const grace = Number(b.start_grace_minutes) > 0 ? Number(b.start_grace_minutes) : 15;

  const { rows } = await query(
    `INSERT INTO timetable_slots
       (class_id, teacher_id, day_of_week, start_time, duration_minutes, mark_window_minutes, start_grace_minutes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [classId, klass.rows[0].teacher_id, dow, startTime, duration, markWindow, grace, user.id]
  );
  await audit(request, user.id, 'timetable.create', { slotId: rows[0].id, classId, dow, startTime });
  return NextResponse.json({ slot: rows[0] }, { status: 201 });
}
