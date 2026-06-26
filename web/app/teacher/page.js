'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import PendingScreen from '@/app/components/PendingScreen';
import { api, getPublicIp } from '@/lib/clientApi';

export default function TeacherPage() {
  return (
    <Shell role="teacher">
      {(user, setUser) =>
        user.status !== 'approved' ? (
          <PendingScreen user={user} onUpdate={setUser} />
        ) : (
          <TeacherHome user={user} />
        )
      }
    </Shell>
  );
}

function TeacherHome({ user }) {
  const [session, setSession] = useState(null);
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [publicIp, setPublicIp] = useState(null);
  const [semester, setSemester] = useState('');
  const [section, setSection] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try { setSession((await api.get('/sessions/active')).session); }
    catch (e) { setError(e.message); }
  }, []);
  const loadPending = useCallback(async () => {
    try { setPending((await api.get('/users/pending')).pending); }
    catch (e) { setError(e.message); }
  }, []);
  const loadRecords = useCallback(async () => {
    try { setRecords((await api.get('/attendance')).attendance); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    loadSession();
    loadPending();
    loadRecords();
    getPublicIp().then(setPublicIp);
  }, [loadSession, loadPending, loadRecords]);

  async function openSession() {
    setError(''); setMsg(''); setBusy(true);
    try {
      const ip = publicIp || (await getPublicIp());
      setPublicIp(ip);
      await api.post('/sessions/open', { network_ip: ip, semester, section });
      setMsg('Attendance session opened. Students on your network can now mark present.');
      await loadSession();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function closeSession() {
    setError(''); setMsg(''); setBusy(true);
    try {
      await api.post(`/sessions/${session.id}/close`, {});
      setMsg('Attendance session closed.');
      await loadSession();
      await loadRecords();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function decide(id, action) {
    setError(''); setMsg('');
    try {
      await api.post(`/users/${id}/${action}`, {});
      await loadPending();
      setMsg(`Student ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (e) { setError(e.message); }
  }

  const reportQuery = session ? `?session_id=${session.id}` : '';

  return (
    <div>
      <div className="row between">
        <h2>Teacher Dashboard</h2>
        <div className="small muted">Subject: <strong>{user.subject}</strong></div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {/* Session control */}
      <div className="card">
        <h3>Attendance session</h3>
        <p className="small muted">
          Your network: <span className="ip-pill">{publicIp || 'detecting…'}</span> — this becomes
          the reference. Students must be on the same network to be marked present.
        </p>
        {session ? (
          <>
            <div className="alert ok">
              Session is <strong>open</strong> — captured network{' '}
              <span className="ip-pill">{session.network_ip}</span> ·{' '}
              <strong>{session.present_count}</strong> present so far.
            </div>
            <button className="danger-btn" onClick={closeSession} disabled={busy}>
              {busy ? 'Closing…' : 'Close session'}
            </button>
          </>
        ) : (
          <>
            <div className="grid2" style={{ maxWidth: 360 }}>
              <div className="field">
                <label>Semester (optional)</label>
                <input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. 3" />
              </div>
              <div className="field">
                <label>Section (optional)</label>
                <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. B" />
              </div>
            </div>
            <button onClick={openSession} disabled={busy}>
              {busy ? 'Opening…' : 'Open attendance session'}
            </button>
          </>
        )}
      </div>

      {/* Pending students */}
      <div className="card">
        <h3>Pending students <span className="muted small">({pending.length})</span></h3>
        {pending.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>No students awaiting approval for {user.subject}.</p>
        ) : (
          <ul className="list">
            {pending.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong> <span className="muted small">({s.email})</span>
                  <div className="small muted">Roll {s.roll_no} · Sem {s.semester} · Sec {s.section}</div>
                </div>
                <div className="spacer" />
                <button className="success sm" onClick={() => decide(s.id, 'approve')}>Approve</button>
                <button className="ghost sm" onClick={() => decide(s.id, 'reject')}>Reject</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Records + reports */}
      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Attendance records</h3>
          <div className="row">
            <button className="secondary sm" onClick={() => api.download('/reports/attendance/csv' + reportQuery, 'attendance.csv')}>Export CSV</button>
            <button className="secondary sm" onClick={() => api.download('/reports/attendance/pdf' + reportQuery, 'attendance.pdf')}>Export PDF</button>
          </div>
        </div>
        <div className="table-wrap mt">
          <table className="table">
            <thead>
              <tr>
                <th>Date / Time</th><th>Student</th><th>Roll</th><th>Sec</th>
                <th>Status</th><th>IP Match</th><th>Student IP</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className={r.status === 'denied' ? 'denied-row' : ''}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.student_name}</td>
                  <td>{r.roll_no}</td>
                  <td>{r.section}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>{r.ip_ok ? 'Yes' : 'No'}</td>
                  <td className="mono small">{r.ip_address || '—'}</td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan="7" className="center muted">No records yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
