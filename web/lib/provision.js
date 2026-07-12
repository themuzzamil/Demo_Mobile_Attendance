import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { generatePassword } from '@/lib/idgen';
import { sendCredentialsEmail } from '@/lib/email';

export const idLabelFor = (role) => (role === 'teacher' ? 'Teacher ID' : 'Roll number');

function loginUrl(request) {
  const origin =
    (request && request.headers.get('origin')) || process.env.APP_BASE_URL || '';
  return origin ? `${origin}/login` : '';
}

// Generate a fresh password for a user, store its hash, and email the credentials
// (login id + password). Used at creation and on every re-issue/reset request.
// Returns { sent, password, loginId, idLabel }.
export async function issueCredentials(request, user, { firstTime = true } = {}) {
  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);

  const idLabel = idLabelFor(user.role);
  const { sent } = await sendCredentialsEmail({
    to: user.email,
    name: user.name,
    idLabel,
    loginId: user.roll_no,
    password,
    loginUrl: loginUrl(request),
    firstTime,
  });
  return { sent, password, loginId: user.roll_no, idLabel };
}
