'use client';
// Client-side PKT (UTC+5) helpers, mirroring lib/schedule.js. Used to work out
// when today's class starts so we can show a "starting soon" countdown. These are
// display-only; the server stays the authority on attendance windows.
export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

// 0=Mon … 6=Sun, computed in PKT.
export function pktDayOfWeek(now = new Date()) {
  const p = new Date(now.getTime() + PKT_OFFSET_MS);
  return (p.getUTCDay() + 6) % 7;
}

// Absolute instant of a slot's PKT time-of-day on today's PKT date. Accepts
// "HH:MM" or "HH:MM:SS" (missing parts default to 0, so seconds are optional).
export function todayStartInstant(startTime, now = new Date()) {
  const parts = String(startTime).split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  const s = parseInt(parts[2], 10) || 0;
  const p = new Date(now.getTime() + PKT_OFFSET_MS);
  return new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), h, m, s) - PKT_OFFSET_MS);
}
