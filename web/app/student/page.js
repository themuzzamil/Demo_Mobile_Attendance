'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import DashboardLayout from '@/app/components/DashboardLayout';
import MessagesInbox from '@/app/components/MessagesInbox';
import Countdown from '@/app/components/Countdown';
import AccountPanel from '@/app/components/AccountPanel';
import { api, getPublicIp } from '@/lib/clientApi';
import { useTab } from '@/lib/useTab';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function StudentPage() {
  return <Shell role="student">{(user) => <StudentHome user={user} />}</Shell>;
}

function StudentHome({ user }) {
  const [tab, setTab] = useTab('mark');
  const [session, setSession] = useState(null);
  const [alreadyMarked, setAlreadyMarked] = useState(null);
  const [windowClosed, setWindowClosed] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [publicIp, setPublicIp] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 4000); };
  const fail = (e) => setError(e.message || String(e));

  const loadSession = useCallback(async () => {
    try {
      const data = await api.get('/sessions/active');
      setSession(data.session); setAlreadyMarked(data.alreadyMarked); setWindowClosed(!!data.window_closed);
    } catch (e) { fail(e); }
  }, []);
  const loadHistory = useCallback(async () => { try { setHistory((await api.get('/attendance/me')).attendance); } catch (e) { fail(e); } }, []);
  const loadSummary = useCallback(async () => { try { setSummary((await api.get('/attendance/my-summary')).courses); } catch (e) { fail(e); } }, []);
  const loadSchedule = useCallback(async () => { try { setSchedule((await api.get('/timetable/my')).slots); } catch (e) { fail(e); } }, []);

  useEffect(() => {
    loadSession(); loadHistory(); loadSummary(); loadSchedule();
    getPublicIp().then(setPublicIp);
    const t = setInterval(loadSession, 15000);
    return () => clearInterval(t);
  }, [loadSession, loadHistory, loadSummary, loadSchedule]);

  async function markPresent() {
    setBusy(true); setError('');
    try {
      const ip = publicIp || (await getPublicIp());
      setPublicIp(ip);
      const r = await api.post('/attendance/check-in', { network_ip: ip });
      flash(r.late ? 'Marked present (late, approved by teacher).' : 'Attendance marked: you are present.');
      setNeedsPermission(false);
      await loadSession(); await loadHistory(); await loadSummary();
    } catch (e) {
      if (e.message && /request permission/i.test(e.message)) setNeedsPermission(true);
      fail(e); await loadSession();
    } finally { setBusy(false); }
  }

  async function requestPermission() {
    if (!session) return;
    const reason = window.prompt('Reason for marking late (sent to your teacher):', '') ?? '';
    try {
      await api.post('/permissions', { type: 'student_late_mark', session_id: session.id, reason });
      flash('Request sent to your teacher. Once approved, tap "Mark me present" again.');
    } catch (e) { fail(e); }
  }

  const marked = alreadyMarked === 'present' || alreadyMarked === 'late';
  const byDay = DAYS.map((d, i) => ({ day: d, items: schedule.filter((s) => s.day_of_week === i) })).filter((g) => g.items.length);

  const nav = [
    { id: 'mark', label: 'Mark attendance', icon: 'play' },
    { id: 'courses', label: 'My attendance', icon: 'chart' },
    { id: 'schedule', label: 'Schedule', icon: 'timetable' },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', count: unread },
    { id: 'history', label: 'History', icon: 'records' },
    { id: 'account', label: 'Account', icon: 'users' },
  ];

  return (
    <DashboardLayout user={user} title="Student" subtitle={`Roll ${user.roll_no} · Sec ${user.section || '—'}`}
                     nav={nav} active={tab} onNavigate={setTab}>
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {tab === 'mark' && (
        <div className="card hero">
          <div className="row between wrap">
            <h3 style={{ margin: 0 }}>Mark attendance</h3>
            {session && !marked && <Countdown until={session.attendance_until} prefix="marking" closedLabel="marking closed" />}
          </div>
          <p className="small muted mt">Your network: <span className="ip-pill">{publicIp || 'detecting…'}</span></p>
          {!session && <div className="alert info">No class is live for your enrolled courses right now. Wait for your teacher to start one.</div>}
          {session && marked && <div className="alert ok">You are marked <strong>{alreadyMarked}</strong> for <strong>{session.subject}</strong>.</div>}
          {session && !marked && (
            <>
              <div className="alert info">Live: <strong>{session.subject}</strong> by {session.teacher_name}. You must be on the class network to be marked present.</div>
              {windowClosed && <div className="alert warn">The marking window has closed. Request permission from your teacher, then mark once approved.</div>}
              <div className="row wrap">
                <button onClick={markPresent} disabled={busy} className="success">{busy ? 'Marking…' : 'Mark me present'}</button>
                {(windowClosed || needsPermission) && <button onClick={requestPermission} className="secondary">Request teacher permission</button>}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'courses' && (
        <div className="card">
          <h3>My courses &amp; attendance</h3>
          {summary.length === 0 ? <p className="muted small" style={{ margin: 0 }}>You are not enrolled in any course yet.</p> : (
            <div className="slot-grid">
              {summary.map((c) => {
                const pct = c.percentage;
                const cls = pct === null ? '' : pct >= 75 ? 'present' : pct >= 50 ? 'late' : 'denied';
                return (
                  <div className="slot" key={c.offering_id}>
                    <div className="when"><span className="mono">{c.code}</span> {c.title}</div>
                    <div className="meta">{c.section ? `Sec ${c.section} · ` : ''}{c.term}</div>
                    <div className="ring-row">
                      <span className={`pct-badge ${cls}`}>{pct === null ? '—' : `${pct}%`}</span>
                      <span className="small muted">{c.attended}/{c.held} attended · {c.late} late · {c.absent} absent</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="card">
          <h3>My weekly schedule</h3>
          {byDay.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No scheduled classes yet.</p> : (
            byDay.map((g) => (
              <div key={g.day} className="mt">
                <strong className="small">{g.day}</strong>
                <ul className="list">
                  {g.items.map((s) => (
                    <li key={s.slot_id}>
                      <span className="timer" style={{ minWidth: 64 }}>{String(s.start_time).slice(0, 5)} PKT</span>
                      <div><span className="mono">{s.code}</span> {s.title}{s.section ? ` · Sec ${s.section}` : ''}
                        <div className="small muted">{s.teacher_name} · {s.duration_minutes}m</div></div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'inbox' && <MessagesInbox onUnread={setUnread} />}

      {tab === 'account' && <AccountPanel user={user} />}

      {tab === 'history' && (
        <div className="card">
          <h3>History</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date / Time</th><th>Course</th><th>Teacher</th><th>Status</th><th>Network IP</th><th>Note</th></tr></thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id} className={a.status === 'denied' ? 'denied-row' : ''}>
                    <td className="small">{new Date(a.created_at).toLocaleString()}</td>
                    <td>{a.subject}</td><td>{a.teacher_name}</td>
                    <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                    <td className="mono small">{a.ip_address || '—'}</td>
                    <td className="small muted">{a.reason || ''}</td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan="6" className="center muted">No attendance yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
