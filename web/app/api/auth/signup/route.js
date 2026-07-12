import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { signToken, toPublicUser } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

// Bootstrap only: create the FIRST administrator account. Once an admin exists,
// self-signup is closed — teachers and students are provisioned by an admin
// (see POST /api/users) and receive a set-password link by email.
export async function POST(request) {
  const b = (await request.json().catch(() => ({}))) || {};

  const adminExists = await query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
  if (adminExists.rowCount > 0) {
    return NextResponse.json(
      { error: 'Sign-up is closed. Accounts are created by an administrator.' },
      { status: 403 }
    );
  }

  const name = (b.name || '').trim();
  const email = (b.email || '').trim().toLowerCase();
  const password = b.password || '';
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  const emailExists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (emailExists.rowCount > 0) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (role, name, email, password_hash, status)
     VALUES ('admin',$1,$2,$3,'approved') RETURNING *`,
    [name, email, hash]
  );
  const user = rows[0];
  await audit(request, user.id, 'auth.bootstrap_admin', {});

  const token = signToken(toPublicUser(user));
  return NextResponse.json({ token, user: toPublicUser(user) }, { status: 201 });
}
