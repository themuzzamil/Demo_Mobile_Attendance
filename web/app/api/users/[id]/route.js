import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Admin can delete any account except their own.
export async function DELETE(request, { params }) {
  const { user, error, status } = requireRole(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  if (Number(params.id) === user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }
  const { rowCount } = await query('DELETE FROM users WHERE id = $1', [params.id]);
  if (rowCount === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  await audit(request, user.id, 'user.delete', { deletedUserId: Number(params.id) });
  return NextResponse.json({ ok: true });
}
