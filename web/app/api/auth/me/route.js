import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getAuth, signToken, toPublicUser } from '@/lib/auth';

export const runtime = 'nodejs';

// Returns the freshest user record + a refreshed token, so a just-approved user
// immediately gets a token carrying status='approved'.
export async function GET(request) {
  const auth = getAuth(request);
  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [auth.id]);
  if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const user = toPublicUser(rows[0]);
  return NextResponse.json({ user, token: signToken(user) });
}
