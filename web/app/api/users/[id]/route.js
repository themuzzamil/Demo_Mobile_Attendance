import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole, requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// GET (admin): a student's current enrollments (offering ids), for the enroll UI.
export async function GET(request, { params }) {
  const { error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const { rows } = await query(
    'SELECT offering_id FROM enrollments WHERE student_id = $1',
    [Number(params.id)]
  );
  return NextResponse.json({ offering_ids: rows.map((r) => r.offering_id) });
}

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
