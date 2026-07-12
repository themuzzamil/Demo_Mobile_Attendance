'use client';
import { useEffect, useState } from 'react';

// Prominent countdown banner shown in the last few minutes before a class starts.
// Renders nothing unless the start is in the future and within `withinMin` minutes.
export default function StartingSoon({ start, code, action, withinMin = 3 }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!start) return null;
  const ms = new Date(start).getTime() - now;
  if (ms <= 0 || ms > withinMin * 60000) return null;
  const mm = Math.floor(ms / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return (
    <div className="starting-soon">
      <span className="ss-dot" />
      <div>
        <strong>{code} starts in {mm}:{String(ss).padStart(2, '0')}</strong>
        <div className="small">{action}</div>
      </div>
    </div>
  );
}
