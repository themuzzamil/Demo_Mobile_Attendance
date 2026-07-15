'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/clientApi';

// The rotating class QR the teacher puts on screen / the projector.
//
// It refreshes itself exactly when the current token expires (every 10s), so the
// code on screen is always live. Students scan it with their phone camera, or
// type the 6-digit code underneath if scanning fails.
export default function ClassQr({ sessionId, fail }) {
  const [data, setData] = useState(null);
  const [big, setBig] = useState(false);
  const [secs, setSecs] = useState(0);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/sessions/${sessionId}/qr`);
      setData(r);
      // Re-fetch right as this token dies (small cushion for round-trip).
      const ms = Math.max(1000, new Date(r.expires_at).getTime() - Date.now() + 250);
      clearTimeout(timer.current);
      timer.current = setTimeout(load, ms);
    } catch (e) {
      fail?.(e);
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 5000); // back off, then retry
    }
  }, [sessionId, fail]);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);

  // Countdown ticker for the "expires in Ns" hint.
  useEffect(() => {
    if (!data) return undefined;
    const t = setInterval(() => {
      setSecs(Math.max(0, Math.ceil((new Date(data.expires_at).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(t);
  }, [data]);

  if (!data) return <p className="muted small">Generating class code…</p>;

  return (
    <div className="qr-panel">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.qr} alt="Class attendance QR code" className={`qr-img${big ? ' big' : ''}`}
           onClick={() => setBig((v) => !v)} />
      <div className="qr-side">
        <div className="qr-code mono">{data.code}</div>
        <div className="small muted">
          Changes every {Math.round(data.rotate_ms / 1000)}s · new code in {secs}s
        </div>
        <p className="small muted" style={{ marginTop: '0.5rem' }}>
          Students scan the QR with their camera, or type this code in their dashboard.
          A photo of it is useless seconds later, and it only works from a student&apos;s own
          registered device.
        </p>
        <button className="secondary sm" onClick={() => setBig((v) => !v)}>
          {big ? 'Shrink' : 'Show bigger'}
        </button>
      </div>
    </div>
  );
}
