import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sweepAbsentees } from '@/lib/sweep';
import { notifyAdmins } from '@/lib/messages';

export const runtime = 'nodejs';

const EMPTY_END_MIN_MS = 10 * 60 * 1000; // empty session can be ended 10 min after start

// Teacher closes their attendance window.
// Body: { message?: string }
//   - Ending an EMPTY session (0 students present) early requires a message to
//     admin and is only allowed 10+ minutes after the session opened.
//   - On close, enrolled non-markers are swept to 'absent'.
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const sessionId = Number(params.id);
  const sRes = await query(
    'SELECT * FROM attendance_sessions WHERE id = $1 AND teacher_id = $2',
    [sessionId, user.id]
  );
  const session = sRes.rows[0];
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (!session.is_open) {
    return NextResponse.json({ error: 'Session already closed' }, { status: 409 });
  }

  const b = (await request.json().catch(() => ({}))) || {};
  const message = (b.message || '').trim();

  const now = new Date();
  const presentRes = await query(
    `SELECT COUNT(*)::int AS n FROM attendance
      WHERE session_id = $1 AND attendee_role = 'student' AND status IN ('present','late')`,
    [sessionId]
  );
  const presentCount = presentRes.rows[0].n;
  const endingEarly = session.ends_at && now < new Date(session.ends_at);
  const isEmptyEarlyEnd = presentCount === 0 && endingEarly;

  if (isEmptyEarlyEnd) {
    const openedAt = new Date(session.opened_at);
    if (now.getTime() - openedAt.getTime() < EMPTY_END_MIN_MS) {
      return NextResponse.json(
        { error: 'You can end an empty session only 10 minutes after starting it.' },
        { status: 403 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: 'To end an empty session, include a message to the admin explaining why.', requires_message: true },
        { status: 400 }
      );
    }
  }

  const { rows } = await query(
    `UPDATE attendance_sessions
        SET is_open = FALSE, closed_at = now(), ended_reason = $2
      WHERE id = $1 RETURNING *`,
    [sessionId, message || null]
  );
  const closed = rows[0];

  const absentees = await sweepAbsentees(closed);

  if (isEmptyEarlyEnd) {
    await notifyAdmins({
      fromUserId: user.id,
      kind: 'session_ended_empty',
      body: `${user.name} ended ${closed.subject} early — no students attended. Reason: ${message}`,
      refId: sessionId,
    });
  }

  await audit(request, user.id, 'session.close', {
    sessionId, presentCount, emptyEarlyEnd: isEmptyEarlyEnd, absentees,
  });
  return NextResponse.json({ session: closed, present_count: presentCount, absentees });
}
