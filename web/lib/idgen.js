import crypto from 'crypto';
import { query } from '@/lib/db';

// Login IDs are numeric, zero-padded, and per-role:
//   students -> 5 digits, starting 00001
//   teachers -> 4 digits, starting 0001
// They live in users.roll_no (unique among non-null), and double as the login id.
const WIDTH = { student: 5, teacher: 4 };

// Next free numeric id for a role, based on its digit width. roll_no is unique
// across ALL users, so we scan every roll_no of exactly that width (not just the
// role's) — otherwise a stray same-width id under another role would collide.
export async function nextLoginId(role) {
  const width = WIDTH[role];
  if (!width) return null;
  const { rows } = await query(
    `SELECT roll_no FROM users
      WHERE roll_no ~ ('^[0-9]{' || $1 || '}$')
      ORDER BY roll_no DESC LIMIT 1`,
    [String(width)]
  );
  const max = rows[0] ? parseInt(rows[0].roll_no, 10) : 0;
  return String(max + 1).padStart(width, '0');
}

// Readable random password (no ambiguous chars like 0/O/1/l/I).
export function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}
