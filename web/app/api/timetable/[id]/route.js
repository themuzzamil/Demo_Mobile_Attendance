import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// DELETE (admin): deactivate a timetable slot.
export async function DELETE(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const slotId = Number(params.id);
  const { rowCount } = await query(
    'UPDATE timetable_slots SET active = FALSE WHERE id = $1',
    [slotId]
  );
  if (rowCount === 0) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  await audit(request, user.id, 'timetable.delete', { slotId });
  return NextResponse.json({ ok: true });
}
