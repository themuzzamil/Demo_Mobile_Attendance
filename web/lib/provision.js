import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { generatePassword } from '@/lib/idgen';
import { sendCredentialsEmail, sendCredentialsReminderEmail } from '@/lib/email';

export const idLabelFor = (role) => (role === 'teacher' ? 'Teacher ID' : 'Roll number');

// A freshly issued password kills every previously emailed one. Within this
// window we refuse to issue another, so a user who taps "get my credentials"
// twice (or whose first mail is slow to arrive) doesn't invalidate the very
// password they're about to type.
export const REISSUE_COOLDOWN_MS = 10 * 60 * 1000;

function loginUrl(request) {
  const origin =
    (request && request.headers.get('origin')) || process.env.APP_BASE_URL || '';
  return origin ? `${origin}/login` : '';
}

// Generate a fresh password for a user, store its hash, and email the credentials
// (login id + password). Used at creation and on every re-issue/reset request.
// Stamps credentials_issued_at so the email can say exactly which one is live.
// Returns { sent, password, loginId, idLabel, issuedAt }.
export async function issueCredentials(request, user, { firstTime = true } = {}) {
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    'UPDATE users SET password_hash = $1, credentials_issued_at = now() WHERE id = $2 RETURNING credentials_issued_at',
    [hash, user.id]
  );
  const issuedAt = rows[0]?.credentials_issued_at ?? new Date();

  const idLabel = idLabelFor(user.role);
  const { sent } = await sendCredentialsEmail({
    to: user.email,
    name: user.name,
    idLabel,
    loginId: user.roll_no,
    password,
    loginUrl: loginUrl(request),
    firstTime,
    issuedAt,
  });
  return { sent, password, loginId: user.roll_no, idLabel, issuedAt };
}

// The user asked for credentials again but a live password was issued moments
// ago. Rather than replace it (which would break the email already in their
// inbox), point them at that email and say when it was sent.
export async function remindCredentials(request, user, issuedAt) {
  const { sent } = await sendCredentialsReminderEmail({
    to: user.email,
    name: user.name,
    idLabel: idLabelFor(user.role),
    loginId: user.roll_no,
    loginUrl: loginUrl(request),
    issuedAt,
  });
  return { sent, reminded: true };
}
