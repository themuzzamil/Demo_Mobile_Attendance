import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Authenticated: change your own password. Body: { current_password, new_password }.
export async function POST(request) {
  const { user, error, status } = requireRole(request);
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const current = b.current_password || '';
  const next = b.new_password || '';
  if (next.length < 6) {
    return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
  }

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  if (!row.password_hash || !(await bcrypt.compare(current, row.password_hash))) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
  }

  const hash = await bcrypt.hash(next, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
  await audit(request, user.id, 'auth.change_password', {});
  return NextResponse.json({ ok: true });
}
