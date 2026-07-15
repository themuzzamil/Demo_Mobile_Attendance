import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { mintToken, codeFor, slotFor, slotExpiresAt, ROTATE_MS } from '@/lib/qr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET (session's teacher, or admin): the current rotating QR + typed code for an
// open session. The teacher's screen re-fetches when `expires_at` passes, so the
// displayed code is never more than one rotation old.
//
// The QR encodes a URL (so a phone's native camera can open it) that lands on the
// student dashboard with the token attached.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'teacher', 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const sessionId = Number(params.id);
  const { rows } = await query(
    'SELECT id, teacher_id, is_open FROM attendance_sessions WHERE id = $1',
    [sessionId]
  );
  const session = rows[0];
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (user.role !== 'admin' && session.teacher_id !== user.id) {
    return NextResponse.json({ error: 'This is not your class' }, { status: 403 });
  }
  if (!session.is_open) {
    return NextResponse.json({ error: 'Session is closed' }, { status: 409 });
  }

  const slot = slotFor();
  const token = mintToken(sessionId, slot);
  const code = codeFor(sessionId, slot);

  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host');
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;
  const url = `${origin}/student?t=${encodeURIComponent(token)}`;

  const qr = await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: 'M' });

  return NextResponse.json({
    token,
    code,
    qr,
    url,
    rotate_ms: ROTATE_MS,
    expires_at: slotExpiresAt(slot).toISOString(),
  });
}
