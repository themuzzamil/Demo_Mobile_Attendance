import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { issueCredentials, remindCredentials, REISSUE_COOLDOWN_MS } from '@/lib/provision';

export const runtime = 'nodejs';

// Public: a user asks for their sign-in credentials by email.
//
// Issuing a password invalidates the previous one, so doing that on every request
// is actively harmful: a user whose login just failed taps this, and the new mail
// kills the password in the email they were already reading — then they try that
// (now dead) password and fail again. So within REISSUE_COOLDOWN_MS of the last
// issue we keep the live password and just remind them which email holds it.
//
// Always responds the same way regardless of whether the email exists (no
// account enumeration).
export async function POST(request) {
  const b = (await request.json().catch(() => ({}))) || {};
  const email = (b.email || '').trim().toLowerCase();

  const generic = NextResponse.json({
    ok: true,
    message: 'If that email belongs to an account, your sign-in details have been emailed to you.',
  });

  if (!email) return generic;

  const { rows } = await query(
    `SELECT id, name, email, role, roll_no, credentials_issued_at
       FROM users WHERE lower(email) = $1 LIMIT 1`,
    [email]
  );
  const target = rows[0];
  // Admins are bootstrap accounts; they don't use the emailed-credentials flow.
  if (!target || target.role === 'admin') return generic;

  const issuedAt = target.credentials_issued_at;
  const stillFresh =
    issuedAt && Date.now() - new Date(issuedAt).getTime() < REISSUE_COOLDOWN_MS;

  if (stillFresh) {
    const r = await remindCredentials(request, target, issuedAt);
    await audit(request, target.id, 'auth.request_access', {
      reminded: true, emailSent: r.sent, issuedAt,
    });
    return generic;
  }

  const cred = await issueCredentials(request, target, { firstTime: false });
  await audit(request, target.id, 'auth.request_access', { emailSent: cred.sent });
  return generic;
}
