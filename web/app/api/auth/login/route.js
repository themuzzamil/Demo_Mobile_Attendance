import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken, toPublicUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(request) {
  const b = (await request.json().catch(() => ({}))) || {};
  const email = (b.email || '').trim().toLowerCase();
  const password = b.password || '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await audit(request, null, 'auth.login_failed', { email });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (user.status === 'rejected') {
    return NextResponse.json({ error: 'Your account has been rejected' }, { status: 403 });
  }
  await audit(request, user.id, 'auth.login', {});
  const token = signToken(toPublicUser(user));
  return NextResponse.json({ token, user: toPublicUser(user) });
}
