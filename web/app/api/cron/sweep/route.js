import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sweepAbsentees } from '@/lib/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auto-close lectures whose end time has passed and sweep enrolled non-markers to
// 'absent'. Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
// Vercel sends `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { rows: expired } = await query(
    `SELECT * FROM attendance_sessions
      WHERE is_open = TRUE AND ends_at IS NOT NULL AND ends_at < now()`
  );

  let closed = 0;
  let absentees = 0;
  for (const s of expired) {
    await query(
      'UPDATE attendance_sessions SET is_open = FALSE, closed_at = now() WHERE id = $1',
      [s.id]
    );
    absentees += await sweepAbsentees(s);
    closed += 1;
  }

  return NextResponse.json({ ok: true, closed, absentees });
}
