import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken, toPublicUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request) {
  const b = (await request.json().catch(() => ({}))) || {};
  // Accept a roll number / teacher id OR an email as the identifier.
  const identifier = (b.identifier ?? b.email ?? '').trim();
  const password = b.password || '';
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Your ID/email and password are required' }, { status: 400 });
  }
  const { rows } = await query(
    'SELECT * FROM users WHERE lower(email) = lower($1) OR roll_no = $1',
    [identifier]
  );
  const user = rows[0];
  // Provisioned account whose password hasn't been issued yet (rare edge case).
  if (user && !user.password_hash) {
    return NextResponse.json(
      { error: 'Your account has no password yet. Use "Get my credentials" to receive one by email.' },
      { status: 403 }
    );
  }
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await audit(request, null, 'auth.login_failed', { identifier });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (user.status === 'rejected') {
    return NextResponse.json({ error: 'Your account has been rejected' }, { status: 403 });
  }
  await audit(request, user.id, 'auth.login', {});
  const token = signToken(toPublicUser(user));
  return NextResponse.json({ token, user: toPublicUser(user) });
}
