// Column definitions + titles shared by the CSV and PDF report exports, so both
// formats always show the same fields in the same order.

const STATUS_LABEL = {
  present: 'Present', late: 'Late', absent: 'Absent',
  denied: 'Rejected', pending: 'Pending approval', not_marked: 'Not marked',
};

// Class roster: one row per enrolled student, totalled across the term.
export const ROSTER_COLS = [
  { key: 'roll_no', label: 'Roll / ID', w: 95 },
  { key: 'name', label: 'Student', w: 140 },
  { key: 'section', label: 'Sec', w: 40 },
  { key: 'present', label: 'Present', w: 55 },
  { key: 'late', label: 'Late', w: 45 },
  { key: 'absent', label: 'Absent', w: 50 },
  { key: 'denied', label: 'Rejected', w: 55 },
  { key: 'pending', label: 'Pending', w: 55 },
  { key: 'held', label: 'Classes held', w: 70 },
  { key: 'percentage', label: 'Attendance %', w: 75, format: (v) => (v === null ? '—' : `${v}%`) },
];

// One class meeting: one row per enrolled student, with how they stood that day.
export const SESSION_COLS = [
  { key: 'roll_no', label: 'Roll / ID', w: 95 },
  { key: 'name', label: 'Student', w: 150 },
  { key: 'section', label: 'Sec', w: 40 },
  { key: 'status', label: 'Status', w: 90, format: (v) => STATUS_LABEL[v] || v },
  { key: 'ip_ok', label: 'IP match', w: 55, format: (v, r) => (!r.attendance_id ? '—' : v ? 'Yes' : 'No') },
  { key: 'ip_address', label: 'IP address', w: 95 },
  { key: 'created_at', label: 'Marked at', w: 110, format: (v) => (v ? new Date(v).toLocaleString() : '—') },
  { key: 'reason', label: 'Note', w: 150 },
];

const classLabel = (o) =>
  `${o.code} — ${o.title}${o.section ? ` · Section ${o.section}` : ''} · ${o.term}`;

export const rosterTitle = (report) =>
  `${classLabel(report.offering)} · Teacher: ${report.offering.teacher_name || '—'} · ` +
  `${report.enrolled_count} enrolled · ${report.sessions_held} classes held`;

export const sessionTitle = (report) => {
  const s = report.session;
  const name = s.code ? `${s.code} — ${s.title}` : s.subject;
  return `${name}${s.section ? ` · Section ${s.section}` : ''} · ` +
    `${new Date(s.opened_at).toLocaleString()} · Teacher: ${s.teacher_name || '—'}`;
};
