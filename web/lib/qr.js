import crypto from 'crypto';

// Rotating class QR / code.
//
// The QR shown on the teacher's screen does NOT encode "attendance" — it encodes
// a short-lived, server-signed token that changes every ROTATE_MS. A student
// photographing it and sending it to a friend outside the room is defeated
// because the token dies before the share round-trip completes, and because the
// mark must still come from the student's own bound device (see check-in).
//
// Tokens are stateless: the signature is recomputed from (session, slot), so
// nothing needs storing. Single-use is enforced by attendance's
// UNIQUE (session_id, student_id) — a student marks at most once per session.

const SECRET = process.env.JWT_SECRET || 'dev_insecure_secret_change_me';

export const ROTATE_MS = 10_000; // QR + code rotate every 10 seconds

// Also accept the immediately previous slot: a scan started at 9.9s into a slot
// must not fail because it landed 0.1s after the rotation. Worst-case validity
// is therefore just under 2 slots (~20s) — still far shorter than the time it
// takes to photograph, send and re-open a code elsewhere.
const GRACE_SLOTS = 1;

export const slotFor = (ms = Date.now()) => Math.floor(ms / ROTATE_MS);
export const slotExpiresAt = (slot) => new Date((slot + 1) * ROTATE_MS);

const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest();

const sign = (sessionId, slot) =>
  hmac(`qr.${sessionId}.${slot}`).toString('base64url').slice(0, 16);

// Token embedded in the QR image (as a URL the phone camera can open).
export const mintToken = (sessionId, slot = slotFor()) =>
  `${sessionId}.${slot}.${sign(sessionId, slot)}`;

// 6-digit fallback the student can type if their camera won't scan.
export const codeFor = (sessionId, slot = slotFor()) =>
  String(hmac(`code.${sessionId}.${slot}`).readUInt32BE(0) % 1_000_000).padStart(6, '0');

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Validate a scanned token OR a typed 6-digit code against a session.
// Returns { ok: true } or { ok: false, reason }.
export function verifyToken(raw, sessionId) {
  const v = String(raw || '').trim();
  if (!v) return { ok: false, reason: 'missing' };

  const now = slotFor();
  const slots = [];
  for (let i = 0; i <= GRACE_SLOTS; i++) slots.push(now - i);

  // Typed fallback code.
  if (/^\d{6}$/.test(v)) {
    return slots.some((s) => safeEq(codeFor(sessionId, s), v))
      ? { ok: true }
      : { ok: false, reason: 'expired' };
  }

  const parts = v.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [sid, slotStr, sig] = parts;
  if (Number(sid) !== Number(sessionId)) return { ok: false, reason: 'wrong_session' };
  const slot = Number(slotStr);
  if (!Number.isFinite(slot)) return { ok: false, reason: 'malformed' };
  if (!slots.includes(slot)) return { ok: false, reason: 'expired' };
  return safeEq(sign(sessionId, slot), sig) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

// Human-readable message for a failed verification.
export const verifyMessage = (reason) =>
  reason === 'expired'
    ? 'That code has expired. Enter the code currently on your teacher’s screen (it changes every 10 seconds).'
    : reason === 'wrong_session'
    ? 'That code belongs to a different class.'
    : reason === 'missing'
    ? 'Scan the QR on your teacher’s screen, or type the 6-digit code shown there.'
    : 'That code is not valid. Use the one currently on your teacher’s screen.';

// sha256 of the browser's device id — we never store the raw value.
export const hashDevice = (deviceId) =>
  deviceId ? crypto.createHash('sha256').update(String(deviceId)).digest('hex') : null;
