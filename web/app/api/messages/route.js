import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';

export const runtime = 'nodejs';

// GET: the caller's inbox (most recent first) + unread count.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher', 'student');
  if (error) return NextResponse.json({ error }, { status });

  const { rows } = await query(
    `SELECT m.*, u.name AS from_name
       FROM messages m LEFT JOIN users u ON u.id = m.from_user_id
      WHERE m.to_user_id = $1
      ORDER BY m.created_at DESC LIMIT 100`,
    [user.id]
  );
  const unread = rows.filter((r) => !r.is_read).length;
  return NextResponse.json({ messages: rows, unread });
}

// POST: mark all of the caller's messages read.
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher', 'student');
  if (error) return NextResponse.json({ error }, { status });
  await query('UPDATE messages SET is_read = TRUE WHERE to_user_id = $1 AND is_read = FALSE', [user.id]);
  return NextResponse.json({ ok: true });
}
