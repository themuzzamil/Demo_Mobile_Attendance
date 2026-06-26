'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import PendingScreen from '@/app/components/PendingScreen';
import { api, getPublicIp } from '@/lib/clientApi';

export default function StudentPage() {
  return (
    <Shell role="student">
      {(user, setUser) =>
        user.status !== 'approved' ? (
          <PendingScreen user={user} onUpdate={setUser} />
        ) : (
          <StudentHome user={user} />
        )
      }
    </Shell>
  );
}

function StudentHome({ user }) {
  const [session, setSession] = useState(null);
  const [alreadyMarked, setAlreadyMarked] = useState(null);
  const [history, setHistory] = useState([]);
  const [publicIp, setPublicIp] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const data = await api.get('/sessions/active');
      setSession(data.session);
      setAlreadyMarked(data.alreadyMarked);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { attendance } = await api.get('/attendance/me');
      setHistory(attendance);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadSession();
    loadHistory();
    getPublicIp().then(setPublicIp);
  }, [loadSession, loadHistory]);

  async function markPresent() {
    setError('');
    setMsg('');
    setBusy(true);
    try {
      const ip = publicIp || (await getPublicIp());
      setPublicIp(ip);
      await api.post('/attendance/check-in', { network_ip: ip });
      setMsg('Attendance marked: you are present.');
      await loadSession();
      await loadHistory();
    } catch (e) {
      setError(e.message);
      await loadSession();
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row between">
        <h2>Attendance</h2>
        <div className="small muted">
          Subject: <strong>{user.subject}</strong> · Roll {user.roll_no}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card">
        <h3>Mark attendance</h3>
        <p className="small muted">
          Your network: <span className="ip-pill">{publicIp || 'detecting…'}</span>
        </p>
        {!session && (
          <div className="alert info">
            No attendance session is open for <strong>{user.subject}</strong> right now.
            Wait for your teacher to start one.
          </div>
        )}
        {session && alreadyMarked === 'present' && (
          <div className="alert ok">You are already marked present for this session.</div>
        )}
        {session && (
          <>
            <div className="alert info">
              Session open by <strong>{session.teacher_name}</strong> for {session.subject}.
              You must be on the same network as the class to be marked present.
            </div>
            <button onClick={markPresent} disabled={busy} className="success">
              {busy ? 'Marking…' : 'Mark me present'}
            </button>
          </>
        )}
      </div>

      <h3>History</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date / Time</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Status</th>
              <th>Network IP</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {history.map((a) => (
              <tr key={a.id} className={a.status === 'denied' ? 'denied-row' : ''}>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.subject}</td>
                <td>{a.teacher_name}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td className="mono small">{a.ip_address || '—'}</td>
                <td className="small muted">{a.reason || ''}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr><td colSpan="6" className="center muted">No attendance yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
