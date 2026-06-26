'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setSession, homePathFor } from '@/lib/clientApi';

const ROLES = [
  { key: 'student', label: 'Student' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'admin', label: 'Admin' },
];

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState('student');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.post('/auth/signup', { role, ...form });
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
        <p className="muted small">Create your account</p>

        <div className="tabs" style={{ marginTop: '1rem' }}>
          {ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={role === r.key ? 'active' : ''}
              onClick={() => { setRole(r.key); setError(''); }}
            >
              {r.label}
            </button>
          ))}
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

          {(role === 'teacher' || role === 'student') && (
            <div className="field">
              <label>Subject</label>
              <input value={form.subject || ''} onChange={(e) => set('subject', e.target.value)} required
                placeholder="e.g. Information Security" />
            </div>
          )}

          {role === 'student' && (
            <div className="grid2">
              <div className="field">
                <label>Semester</label>
                <input value={form.semester || ''} onChange={(e) => set('semester', e.target.value)} required placeholder="e.g. 3" />
              </div>
              <div className="field">
                <label>Section</label>
                <input value={form.section || ''} onChange={(e) => set('section', e.target.value)} required placeholder="e.g. B" />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Roll number</label>
                <input value={form.roll_no || ''} onChange={(e) => set('roll_no', e.target.value)} required placeholder="e.g. BSCS-21-045" />
              </div>
            </div>
          )}

          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} required minLength={6} />
          </div>

          {role !== 'admin' && (
            <div className="alert info small">
              {role === 'teacher'
                ? 'Teacher accounts require admin approval before you can take attendance.'
                : 'Student accounts require approval by a teacher of your subject before you can mark attendance.'}
            </div>
          )}

          <button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="muted small center" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
