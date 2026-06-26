import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { effectiveIp, getServerSeenIp } from '@/lib/ip';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Teacher opens an attendance window. The teacher's current public network IP is
// captured as the reference; students must be on the same network to be present.
// Body: { network_ip (client-detected public IP), semester?, section? }
export async function POST(request) {
  const { user, error, status } = requireApproved(request, 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const b = (await request.json().catch(() => ({}))) || {};
  const networkIp = effectiveIp(b.network_ip, request);
  if (!networkIp) {
    return NextResponse.json(
      { error: 'Could not determine your network IP. Check your connection and retry.' },
      { status: 400 }
    );
  }
  const semester = (b.semester || '').trim() || null;
  const section = (b.section || '').trim() || null;

  // Only one open session per teacher: close any existing open ones first.
  await query(
    `UPDATE attendance_sessions SET is_open = FALSE, closed_at = now()
      WHERE teacher_id = $1 AND is_open = TRUE`,
    [user.id]
  );

  const { rows } = await query(
    `INSERT INTO attendance_sessions (teacher_id, subject, semester, section, network_ip, server_ip)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [user.id, user.subject, semester, section, networkIp, getServerSeenIp(request)]
  );
  await audit(request, user.id, 'session.open', { sessionId: rows[0].id, networkIp });
  return NextResponse.json({ session: rows[0] }, { status: 201 });
}
