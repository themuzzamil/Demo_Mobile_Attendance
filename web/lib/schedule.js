// Scheduling helpers for timetable-driven sessions.
//
// TIME ZONE: timetable `start_time` values are Pakistan Standard Time (PKT =
// UTC+5, no daylight saving). They are resolved against the current PKT date and
// converted to absolute UTC instants. All window comparisons (teacher grace,
// student marking window, lecture end) are then done server-side on real UTC
// instants, so a client clock can never decide a window.

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan Standard Time = UTC+5

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// View an instant as PKT wall-clock: the returned Date's UTC fields read as PKT.
function pktView(now) {
  return new Date(now.getTime() + PKT_OFFSET_MS);
}

// JS getUTCDay(): 0=Sun..6=Sat  ->  our scheme 0=Mon..6=Sun (computed in PKT)
export function dayOfWeek(date = new Date()) {
  return (pktView(date).getUTCDay() + 6) % 7;
}

export function dayName(dow) {
  return DAY_NAMES[dow] ?? String(dow);
}

// Allow a teacher to start a class slightly before the scheduled time without it
// counting as late.
const EARLY_START_MS = 10 * 60 * 1000;

// Resolve a slot's occurrence for `now`: its scheduled start today (PKT time of
// day on today's PKT date, as an absolute UTC instant), the teacher grace
// deadline, and the lecture end.
export function slotOccurrence(slot, now = new Date()) {
  const [h, m, s] = String(slot.start_time).split(':').map((n) => parseInt(n, 10) || 0);
  const p = pktView(now);
  // Today's PKT calendar date at the slot's PKT time-of-day, back to real UTC.
  const utcMs = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate(), h, m, s) - PKT_OFFSET_MS;
  const scheduledStart = new Date(utcMs);
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
