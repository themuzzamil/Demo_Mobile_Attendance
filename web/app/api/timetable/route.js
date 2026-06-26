import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { dayName } from '@/lib/schedule';

export const runtime = 'nodejs';

// Two time ranges [aStart, aEnd) and [bStart, bEnd) overlap?
function overlaps(aStart, aDur, bStart, bDur) {
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
  const a1 = toMin(aStart), a2 = a1 + aDur;
  const b1 = toMin(bStart), b2 = b1 + bDur;
  return a1 < b2 && b1 < a2;
}

// GET: list timetable slots (admin: all; teacher: their own) with course info.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });
  const params = [];
  let where = 'WHERE t.active = TRUE';
  if (user.role === 'teacher') { params.push(user.id); where += ` AND t.teacher_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT t.*, c.code, c.title, o.section, o.term, o.semester, u.name AS teacher_name
       FROM timetable_slots t
       JOIN course_offerings o ON o.id = t.offering_id
       JOIN courses c ON c.id = o.course_id
       LEFT JOIN users u ON u.id = t.teacher_id
       ${where}
      ORDER BY t.day_of_week, t.start_time`,
    params
  );
  return NextResponse.json({ slots: rows.map((r) => ({ ...r, day_name: dayName(r.day_of_week) })) });
}

// POST (admin): add a slot for an offering. Teacher is derived from the offering.
// Blocks conflicts: the teacher or any student in the section can't be double-booked.
// Body: { offering_id, day_of_week, start_time, duration_minutes?, mark_window_minutes?, start_grace_minutes? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const b = (await request.json().catch(() => ({}))) || {};
  const offeringId = Number(b.offering_id);
  const dow = Number(b.day_of_week);
  const startTime = (b.start_time || '').trim();
  if (!offeringId || Number.isNaN(dow) || dow < 0 || dow > 6 || !/^\d{1,2}:\d{2}$/.test(startTime)) {
    return NextResponse.json({ error: 'offering_id, day_of_week (0-6) and start_time ("HH:MM") are required' }, { status: 400 });
  }
  const offRes = await query(
    `SELECT o.*, c.code FROM course_offerings o JOIN courses c ON c.id = o.course_id WHERE o.id = $1 AND o.active`,
    [offeringId]
  );
  const off = offRes.rows[0];
  if (!off) return NextResponse.json({ error: 'Offering not found' }, { status: 404 });
  if (!off.teacher_id) return NextResponse.json({ error: 'Assign a teacher to the offering first' }, { status: 400 });

  const duration = Number(b.duration_minutes) > 0 ? Number(b.duration_minutes) : 60;
  const markWindow = Number(b.mark_window_minutes) > 0 ? Number(b.mark_window_minutes) : 15;
  const grace = Number(b.start_grace_minutes) > 0 ? Number(b.start_grace_minutes) : 15;

  // Conflict check: same day, overlapping time, same teacher OR same section+semester.
  const sameDay = await query(
    `SELECT t.start_time, t.duration_minutes, t.teacher_id, o.section, o.semester, c.code
       FROM timetable_slots t
       JOIN course_offerings o ON o.id = t.offering_id
       JOIN courses c ON c.id = o.course_id
      WHERE t.active AND t.day_of_week = $1`,
    [dow]
  );
  for (const s of sameDay.rows) {
    if (!overlaps(startTime, duration, s.start_time, s.duration_minutes)) continue;
    if (s.teacher_id === off.teacher_id) {
      return NextResponse.json({ error: `Conflict: this teacher already has ${s.code} at that time.` }, { status: 409 });
    }
    if ((s.section || '') === (off.section || '') && (s.semester || '') === (off.semester || '') && (off.section || off.semester)) {
      return NextResponse.json({ error: `Conflict: this section already has ${s.code} at that time.` }, { status: 409 });
    }
  }

  const { rows } = await query(
    `INSERT INTO timetable_slots
       (offering_id, teacher_id, day_of_week, start_time, duration_minutes, mark_window_minutes, start_grace_minutes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [offeringId, off.teacher_id, dow, startTime, duration, markWindow, grace, user.id]
  );
  await audit(request, user.id, 'timetable.create', { slotId: rows[0].id, offeringId, dow, startTime });
  return NextResponse.json({ slot: rows[0] }, { status: 201 });
}
