'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/clientApi';

export default function RequestAccessPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/auth/request-access', { email });
      setDone(res.message || 'If that email belongs to an account, a link has been sent.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">Attend<span>Net</span></div>
        <p className="muted small">Get your sign-in credentials</p>
        <h3 style={{ marginTop: '1rem' }}>Email me my credentials</h3>
        <p className="muted small">
          Enter the email your administrator registered. We&apos;ll email your
          <strong> roll number / ID</strong> and a <strong>new password</strong>.
          (Any previous password will stop working.)
        </p>
        {error && <div className="alert error">{error}</div>}
        {done ? (
          <div className="alert ok">{done}</div>
        ) : (
          <form onSubmit={submit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Sending…' : 'Send link'}
            </button>
          </form>
        )}
        <p className="muted small center" style={{ marginTop: '1rem', marginBottom: 0 }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
