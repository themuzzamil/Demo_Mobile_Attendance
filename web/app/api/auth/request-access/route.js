import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { audit } from '@/lib/audit';
import { issueCredentials } from '@/lib/provision';

export const runtime = 'nodejs';

// Public: a user asks for their sign-in credentials by email. Generates a FRESH
// password (the previous one stops working) and emails their login id + password.
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
    "SELECT id, name, email, role, roll_no FROM users WHERE email = $1",
    [email]
  );
  const target = rows[0];
  // Admins are bootstrap accounts; they don't use the emailed-credentials flow.
  if (!target || target.role === 'admin') return generic;

  const cred = await issueCredentials(request, target, { firstTime: false });
  await audit(request, target.id, 'auth.request_access', { emailSent: cred.sent });
  return generic;
}
