import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { issueCredentials } from '@/lib/provision';
import { emailConfigured } from '@/lib/email';

export const runtime = 'nodejs';

// POST (admin): (re)issue credentials to a teacher/student — generates a fresh
// password and emails their login id + password. Also serves as an admin reset.
export async function POST(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });

  const id = Number(params.id);
  const { rows } = await query(
    "SELECT id, name, email, role, roll_no FROM users WHERE id = $1",
    [id]
  );
  const target = rows[0];
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Admins manage their own password' }, { status: 400 });
  }

  const cred = await issueCredentials(request, target, { firstTime: false });
  await audit(request, user.id, 'user.credentials_reissue', { targetUserId: target.id, emailSent: cred.sent });
  return NextResponse.json({
    credentials: {
      sent: cred.sent,
      idLabel: cred.idLabel,
      loginId: cred.loginId,
      password: cred.password,
      emailConfigured: emailConfigured(),
    },
  });
}
