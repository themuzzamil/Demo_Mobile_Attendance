import { NextResponse } from 'next/server';
import { query } from './db.js';
import { requireApproved } from './auth.js';
import { audit } from './audit.js';

// Shared logic for approve/reject. newStatus is 'approved' or 'rejected'.
export async function setApproval(request, targetId, newStatus) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [targetId]);
  const target = rows[0];
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Authorization: who may act on whom.
  const isAdminOnTeacher = user.role === 'admin' && target.role === 'teacher';
  const isTeacherOnStudent =
    user.role === 'teacher' &&
    target.role === 'student' &&
    target.subject === user.subject;

  if (!isAdminOnTeacher && !isTeacherOnStudent) {
    return NextResponse.json(
      { error: 'You are not allowed to approve this account' },
      { status: 403 }
    );
  }

  const { rows: updated } = await query(
    `UPDATE users SET status = $1, approved_by = $2 WHERE id = $3
     RETURNING id, role, name, email, status, subject, semester, section, roll_no`,
    [newStatus, user.id, targetId]
  );
  await audit(request, user.id, `user.${newStatus}`, { targetId: Number(targetId) });
  return NextResponse.json({ user: updated[0] });
}
