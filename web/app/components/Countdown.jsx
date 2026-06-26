'use client';
import { useEffect, useState } from 'react';

// Live mm:ss countdown to `until`. Shows an urgent style under a minute and a
// closed style once the deadline passes. Purely presentational — the server is
// still the authority on whether a window is open.
export default function Countdown({ until, prefix = 'closes in', closedLabel = 'window closed' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <span className="timer closed">{closedLabel}</span>;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return (
    <span className={ms < 60000 ? 'timer urgent' : 'timer'}>
      {prefix} {mins}:{String(secs).padStart(2, '0')}
    </span>
  );
}
