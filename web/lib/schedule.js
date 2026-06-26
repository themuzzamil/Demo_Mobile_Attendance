// Scheduling helpers for timetable-driven sessions.
//
// NOTE on time zones: a slot's `start_time` is interpreted in UTC and combined
// with the server's current UTC date to resolve a concrete occurrence. All
// window comparisons (teacher grace, student marking window, lecture end) are
// then done server-side in UTC, so a client clock can never decide a window.
// (A configurable institution time zone is a planned enhancement.)

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// JS getUTCDay(): 0=Sun..6=Sat  ->  our scheme 0=Mon..6=Sun
export function dayOfWeek(date = new Date()) {
  return (date.getUTCDay() + 6) % 7;
}

export function dayName(dow) {
  return DAY_NAMES[dow] ?? String(dow);
}

// Allow a teacher to start a class slightly before the scheduled time without it
// counting as late.
const EARLY_START_MS = 10 * 60 * 1000;

// Resolve a slot's occurrence for `now` (its scheduled start today, the teacher
// grace deadline, and the lecture end).
export function slotOccurrence(slot, now = new Date()) {
  const [h, m, s] = String(slot.start_time).split(':').map((n) => parseInt(n, 10) || 0);
  const scheduledStart = new Date(now);
  scheduledStart.setUTCHours(h, m, s, 0);
  const graceEnd = new Date(scheduledStart.getTime() + slot.start_grace_minutes * 60000);
  const endsAt = new Date(scheduledStart.getTime() + slot.duration_minutes * 60000);
  return { scheduledStart, graceEnd, endsAt };
}

// Can the teacher start this slot's class right now?
//   on_time          -> start normally (teacher present)
//   too_early        -> before the (early-allowance) start window
//   needs_permission -> past the grace deadline; needs admin approval (-> late)
export function teacherStartState(slot, now = new Date()) {
  const { scheduledStart, graceEnd, endsAt } = slotOccurrence(slot, now);
  const earliest = new Date(scheduledStart.getTime() - EARLY_START_MS);
  let state;
  if (now < earliest) state = 'too_early';
  else if (now <= graceEnd) state = 'on_time';
  else state = 'needs_permission';
  return { state, scheduledStart, graceEnd, endsAt };
}

// When a session is actually opened at `openedAt`, the student marking window
// closes mark_window_minutes later.
export function attendanceUntil(slot, openedAt = new Date()) {
  return new Date(openedAt.getTime() + slot.mark_window_minutes * 60000);
}
