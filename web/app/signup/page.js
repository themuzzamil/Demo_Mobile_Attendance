'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setSession, homePathFor } from '@/lib/clientApi';

// Bootstrap only: creates the FIRST administrator. Once an admin exists the API
// closes this route (403) — teachers/students are provisioned by an admin and
// get a set-password link by email.
export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.post('/auth/signup', { role: 'admin', ...form });
      setSession(token, user);
      router.replace(homePathFor(user));
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
        <p className="muted small">First-time setup</p>
        <h3 style={{ marginTop: '1rem' }}>Create the administrator account</h3>
        <div className="alert info small">
          This page only works once, to create the first admin. After that,
          teachers and students are added by the admin and receive their login ID
          and password by email.
        </div>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Full name</label>
            <input value={form.name || ''} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} required minLength={6} />
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating…' : 'Create administrator'}
          </button>
        </form>

        <p className="muted small center" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
