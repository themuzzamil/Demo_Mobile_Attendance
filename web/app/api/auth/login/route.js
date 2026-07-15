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
  // Trim the password too: these are emailed, and copy-paste routinely drags in a
  // trailing space or newline — which silently fails the hash compare. The
  // generated passwords never contain spaces, so trimming can't reject a valid one.
  const password = (b.password || '').trim();
  if (!identifier || !password) {
    return NextResponse.json({ error: 'Your ID/email and password are required' }, { status: 400 });
  }
  // An exact email match wins over a roll_no match, and LIMIT 1 keeps the lookup
  // deterministic — without an explicit order, two matching rows would make the
  // chosen account (and therefore the login result) vary between attempts.
  const { rows } = await query(
    `SELECT * FROM users
      WHERE lower(email) = lower($1) OR roll_no = $1
      ORDER BY (lower(email) = lower($1)) DESC, id ASC
      LIMIT 1`,
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
    // Deliberately does not reveal whether the account exists. The hint matters:
    // every re-issue invalidates the previous password, so the usual cause of a
    // failure here is typing one from an older credentials email.
    return NextResponse.json(
      {
        error:
          'Invalid ID/email or password. If you were sent more than one credentials email, use the most recent one — older passwords stop working.',
      },
      { status: 401 }
    );
  }
  if (user.status === 'rejected') {
    return NextResponse.json({ error: 'Your account has been rejected' }, { status: 403 });
  }
  await audit(request, user.id, 'auth.login', {});
  const token = signToken(toPublicUser(user));
  return NextResponse.json({ token, user: toPublicUser(user) });
}
