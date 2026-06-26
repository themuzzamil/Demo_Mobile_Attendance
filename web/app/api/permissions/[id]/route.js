import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sendMessage } from '@/lib/messages';

export const runtime = 'nodejs';

// POST: approve or reject a permission request. Body: { decision: 'approve'|'reject' }
//   teacher_late_start -> only an admin may decide
//   student_late_mark  -> only the session's teacher may decide
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const id = Number(params.id);
  const b = (await request.json().catch(() => ({}))) || {};
  const decision = b.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const prRes = await query('SELECT * FROM permission_requests WHERE id = $1', [id]);
  const pr = prRes.rows[0];
  if (!pr) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (pr.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${pr.status}` }, { status: 409 });
  }

  // Authorize the decider.
  if (pr.type === 'teacher_late_start') {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can decide this' }, { status: 403 });
    }
  } else {
    // student_late_mark -> must be the session's teacher
    const s = await query('SELECT teacher_id, subject FROM attendance_sessions WHERE id = $1', [pr.session_id]);
    if (s.rowCount === 0 || s.rows[0].teacher_id !== user.id) {
      return NextResponse.json({ error: 'Only the class teacher can decide this' }, { status: 403 });
    }
  }

  const newStatus = decision === 'approve' ? 'approved' : 'rejected';
  await query(
    `UPDATE permission_requests SET status = $1, decided_by = $2, decided_at = now() WHERE id = $3`,
    [newStatus, user.id, id]
  );

  const verb = decision === 'approve' ? 'approved' : 'rejected';
  const what = pr.type === 'teacher_late_start' ? 'late start' : 'late attendance mark';
  await sendMessage({
    toUserId: pr.requester_id,
    fromUserId: user.id,
    kind: 'info',
    body: `Your ${what} request was ${verb} by ${user.name}.`,
    refId: id,
  });
  await audit(request, user.id, 'permission.decide', { id, type: pr.type, decision });

  return NextResponse.json({ ok: true, status: newStatus });
}
