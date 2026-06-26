import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// List sessions. teacher -> own; admin -> all. Includes present count.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const where = [];
  const values = [];
  let i = 1;
  if (user.role === 'teacher') { where.push(`s.teacher_id = $${i++}`); values.push(user.id); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT s.*, t.name AS teacher_name,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.status = 'present') AS present_count,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS total_count
       FROM attendance_sessions s
       JOIN users t ON t.id = s.teacher_id
       ${clause}
      ORDER BY s.opened_at DESC LIMIT 500`,
    values
  );
  return NextResponse.json({ sessions: rows });
}
