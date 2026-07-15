import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sendMessage } from '@/lib/messages';

export const runtime = 'nodejs';

// POST (admin): unbind a student's device so their next attendance mark registers
// a new phone. Needed when a student genuinely changes device — otherwise every
// mark from the new phone is flagged for the teacher.
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const id = Number(params.id);
  const { rows } = await query(
    'UPDATE users SET device_hash = NULL WHERE id = $1 RETURNING id, name, device_hash',
    [id]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await sendMessage({
    toUserId: id,
    fromUserId: user.id,
    kind: 'info',
    body: 'Your registered device was reset by an admin. The next device you mark attendance from will become your registered one.',
  });
  await audit(request, user.id, 'user.reset_device', { userId: id });

  return NextResponse.json({ ok: true });
}
