'use client';
import { useState } from 'react';
import { api } from '@/lib/clientApi';

// Shows the user's login id (roll no / teacher id) and a change-password form.
export default function AccountPanel({ user }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const idLabel = user.role === 'teacher' ? 'Teacher ID' : 'Roll number';

  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg('');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: next });
      setMsg('Password changed.');
      setCur(''); setNext(''); setConfirm('');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="card">
        <h3>Account</h3>
        <div className="stat">
          <div className="item"><div className="n mono">{user.roll_no || '—'}</div><div className="l">{idLabel}</div></div>
          <div className="item"><div className="n" style={{ fontSize: '1rem' }}>{user.name}</div><div className="l">Name</div></div>
          <div className="item"><div className="n" style={{ fontSize: '1rem' }}>{user.email}</div><div className="l">Email</div></div>
        </div>
        <p className="small muted mt">You sign in with your {idLabel.toLowerCase()} ({user.roll_no || '—'}) or your email.</p>
      </div>

      <div className="card">
        <h3>Change password</h3>
        {error && <div className="alert error">{error}</div>}
        {msg && <div className="alert ok">{msg}</div>}
        <form onSubmit={submit} style={{ maxWidth: 420 }}>
          <div className="field"><label>Current password</label>
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
          <div className="field"><label>New password</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} /></div>
          <div className="field"><label>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
        </form>
      </div>
    </>
  );
}
