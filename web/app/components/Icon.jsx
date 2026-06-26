'use client';

// Lightweight inline line-icons (no emoji, no icon font). 20x20, stroke = currentColor.
const PATHS = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  approvals: <><path d="M16 11l2 2 4-4" /><path d="M14 19a4 4 0 0 0-8 0" /><circle cx="10" cy="9" r="3" /></>,
  course: <><path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15l-7-3-7 3V5z" /></>,
  offering: <><path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M2 16l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  timetable: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5 5h14l3 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3-7z" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4V8z" /></>,
  records: <><path d="M9 2h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h6" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l3-3 3 2 4-5" /></>,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  pin: <><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.8 }) {
  const p = PATHS[name];
  if (!p) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p}
    </svg>
  );
}
