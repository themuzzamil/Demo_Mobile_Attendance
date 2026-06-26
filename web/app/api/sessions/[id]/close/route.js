import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Teacher closes their attendance window.
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { rows } = await query(
    `UPDATE attendance_sessions SET is_open = FALSE, closed_at = now()
      WHERE id = $1 AND teacher_id = $2 RETURNING *`,
    [params.id, user.id]
  );
  if (!rows[0]) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  await audit(request, user.id, 'session.close', { sessionId: Number(params.id) });
  return NextResponse.json({ session: rows[0] });
}
