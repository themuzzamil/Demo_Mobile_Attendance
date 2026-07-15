'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import DashboardLayout from '@/app/components/DashboardLayout';
import Countdown from '@/app/components/Countdown';
import StartingSoon from '@/app/components/StartingSoon';
import AccountPanel from '@/app/components/AccountPanel';
import ClassReports from '@/app/components/ClassReports';
import ClassQr from '@/app/components/ClassQr';
import { api, getPublicIp } from '@/lib/clientApi';
import { useTab } from '@/lib/useTab';

export default function TeacherPage() {
  return <Shell role="teacher">{(user) => <TeacherHome user={user} />}</Shell>;
}

function TeacherHome({ user }) {
  const [tab, setTab] = useTab('today');
  const [session, setSession] = useState(null);
  const [today, setToday] = useState([]);
  const [requests, setRequests] = useState([]);
  const [records, setRecords] = useState([]);
  const [publicIp, setPublicIp] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 4000); };
  const fail = (e) => setError(e.message || String(e));

  const loadSession = useCallback(async () => { try { setSession((await api.get('/sessions/active')).session); } catch (e) { fail(e); } }, []);
  const loadToday = useCallback(async () => { try { setToday((await api.get('/timetable/today')).slots); } catch (e) { fail(e); } }, []);
  const loadRequests = useCallback(async () => { try { setRequests((await api.get('/permissions')).requests); } catch (e) { fail(e); } }, []);
  const loadRecords = useCallback(async () => { try { setRecords((await api.get('/attendance')).attendance); } catch (e) { fail(e); } }, []);

  useEffect(() => {
    loadSession(); loadToday(); loadRequests(); loadRecords();
    getPublicIp().then(setPublicIp);
    const t = setInterval(() => { loadSession(); loadToday(); loadRequests(); }, 20000);
    return () => clearInterval(t);
  }, [loadSession, loadToday, loadRequests, loadRecords]);

  async function startClass(slot) {
    setBusy(true); setError('');
    try {
      const ip = publicIp || (await getPublicIp());
      setPublicIp(ip);
      const r = await api.post('/sessions/open', { slot_id: slot.slot_id, network_ip: ip });
      flash(`Class started — you are marked ${r.teacher_status}.`);
      await loadSession(); await loadToday();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function requestStartPermission(slot) {
    const reason = window.prompt('Reason for starting late (sent to admin):', '') ?? '';
    try {
      await api.post('/permissions', { type: 'teacher_late_start', slot_id: slot.slot_id, reason });
      flash('Permission request sent to admin.'); await loadToday();
    } catch (e) { fail(e); }
  }

  async function decideRequest(id, decision) {
    try { await api.post(`/permissions/${id}`, { decision }); await loadRequests(); flash(`Request ${decision}d.`); }
    catch (e) { fail(e); }
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  // Soonest class today that hasn't started yet — drives the "starting soon" banner.
  const upcoming = today
    .filter((s) => !s.open_session && s.scheduled_start && new Date(s.scheduled_start).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start))[0];

  const nav = [
    { id: 'today', label: "Today's classes", icon: 'play' },
    { id: 'requests', label: 'Requests', icon: 'bell', count: pendingRequests.length },
    { id: 'reports', label: 'Reports', icon: 'chart' },
    { id: 'records', label: 'Records', icon: 'records' },
    { id: 'account', label: 'Account', icon: 'users' },
  ];

  return (
    <DashboardLayout user={user} title="Teacher" subtitle={user.roll_no ? `ID ${user.roll_no}` : 'Teacher'} nav={nav} active={tab} onNavigate={setTab}>
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {session && (
        <ActiveSession session={session} busy={busy} setBusy={setBusy}
          onClosed={() => { loadSession(); loadToday(); loadRecords(); }}
          onDecided={() => { loadSession(); loadRecords(); }} flash={flash} fail={fail} />
      )}

      {!session && upcoming && (
        <StartingSoon start={upcoming.scheduled_start} code={upcoming.code}
                      action="Open Today's classes and start it when you're ready." />
      )}

      {tab === 'today' && (
        <div className="card">
          <h3>Today's classes</h3>
          <p className="small muted">Your network: <span className="ip-pill">{publicIp || 'detecting…'}</span> — captured as the reference when you start a class.</p>
          {today.length === 0 ? <p className="muted small">No classes scheduled for today.</p> : (
            <div className="slot-grid">
              {today.map((s) => (
                <div className="slot" key={s.slot_id}>
                  <div className="when">{String(s.start_time).slice(0, 5)} PKT · <span className="mono">{s.code}</span> {s.title}{s.section ? ` · ${s.section}` : ''}</div>
                  <div className="meta">{s.duration_minutes}m lecture · mark {s.mark_window_minutes}m · grace {s.start_grace_minutes}m</div>
                  {s.open_session ? (
                    <span className="badge approved">In progress</span>
                  ) : s.start_state === 'too_early' ? (
                    <div className="row" style={{ gap: '0.5rem' }}>
                      <span className="badge">{String(s.start_time).slice(0, 5)} PKT</span>
                      <Countdown until={s.scheduled_start} prefix="starts in" closedLabel="starting now" />
                    </div>
                  ) : s.can_start ? (
                    <button className="success sm full-sm" disabled={busy} onClick={() => startClass(s)}>
                      {s.start_state === 'needs_permission' ? 'Start (approved)' : 'Start class'}
                    </button>
                  ) : (
                    <button className="secondary sm full-sm" onClick={() => requestStartPermission(s)}>Request admin permission</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'requests' && (
        <div className="card">
          <h3>Student late-mark requests</h3>
          {requests.length === 0 ? <p className="muted small">No requests.</p> : (
            <ul className="list">
              {requests.map((r) => (
                <li key={r.id}>
                  <div><strong>{r.requester_name}</strong> <span className="muted small">{r.roll_no || ''} · {r.subject}</span>
                    {r.reason && <div className="small muted">“{r.reason}”</div>}</div>
                  <div className="spacer" />
                  {r.status === 'pending' ? (
                    <>
                      <button className="success sm" onClick={() => decideRequest(r.id, 'approve')}>Approve</button>
                      <button className="ghost sm" onClick={() => decideRequest(r.id, 'reject')}>Reject</button>
                    </>
                  ) : <span className={`badge ${r.status === 'rejected' ? 'rejected' : 'approved'}`}>{r.status}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'reports' && <ClassReports role="teacher" flash={flash} fail={fail} />}

      {tab === 'records' && (
        <div className="card">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Attendance records</h3>
            <div className="row wrap">
              <button className="secondary sm" onClick={() => api.download('/reports/attendance/csv', 'attendance.csv')}>Export CSV</button>
              <button className="secondary sm" onClick={() => api.download('/reports/attendance/pdf', 'attendance.pdf')}>Export PDF</button>
            </div>
          </div>
          <div className="table-wrap mt">
            <table className="table">
              <thead><tr><th>Date / Time</th><th>Student</th><th>Roll</th><th>Sec</th><th>Status</th><th>IP Match</th><th>Student IP</th></tr></thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className={r.status === 'denied' ? 'denied-row' : ''}>
                    <td className="small">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.student_name}</td><td>{r.roll_no}</td><td>{r.section}</td>
                    <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                    <td>{r.ip_ok ? 'Yes' : 'No'}</td><td className="mono small">{r.ip_address || '—'}</td>
                  </tr>
                ))}
                {records.length === 0 && <tr><td colSpan="7" className="center muted">No records yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'account' && <AccountPanel user={user} />}
    </DashboardLayout>
  );
}

function ActiveSession({ session, busy, setBusy, onClosed, onDecided, flash, fail }) {
  const [endMsg, setEndMsg] = useState('');
  const [showEnd, setShowEnd] = useState(false);
  const [pending, setPending] = useState([]);
  const noStudents = Number(session.present_count) === 0 && Number(session.late_count) === 0 && Number(session.pending_count || 0) === 0;

  const loadPending = useCallback(async () => {
    try {
      const r = await api.get(`/attendance?session_id=${session.id}&status=pending`);
      setPending(r.attendance);
    } catch (e) { fail(e); }
  }, [session.id, fail]);

  useEffect(() => {
    loadPending();
    const t = setInterval(loadPending, 10000);
    return () => clearInterval(t);
  }, [loadPending]);

  async function decide(body, label) {
    setBusy(true);
    try {
      const r = await api.post('/attendance/decide', body);
      flash(`${label} — ${r.decided} student(s).`);
      await loadPending();
      onDecided?.();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function close(message) {
    setBusy(true);
    try {
      const r = await api.post(`/sessions/${session.id}/close`, message ? { message } : {});
      flash(`Session closed. ${r.absentees ? `${r.absentees} marked absent.` : ''}`);
      setShowEnd(false); setEndMsg('');
      onClosed();
    } catch (e) {
      if (e.message && /message to the admin/i.test(e.message)) { setShowEnd(true); fail(e); }
      else fail(e);
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ borderColor: '#bfdbfe' }}>
      <div className="row between wrap">
        <h3 style={{ margin: 0 }}>Live session · {session.subject}{session.section ? ` · ${session.section}` : ''}</h3>
        <Countdown until={session.attendance_until} prefix="marking" closedLabel="marking closed" />
      </div>
      <div className="stat mt">
        <div className="item"><div className="n">{session.present_count}</div><div className="l">Present</div></div>
        <div className="item"><div className="n">{session.late_count}</div><div className="l">Late</div></div>
        <div className="item"><div className="n">{pending.length}</div><div className="l">Pending</div></div>
      </div>
      <p className="small muted mt">Network <span className="ip-pill">{session.network_ip}</span> · you are marked <span className={`badge ${session.teacher_status}`}>{session.teacher_status}</span></p>

      <div className="mt" style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.9rem' }}>
        <strong className="small">Show this to the class</strong>
        <ClassQr sessionId={session.id} fail={fail} />
      </div>

      <div className="mt" style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.9rem' }}>
        <div className="row between wrap">
          <strong className="small">Waiting for your approval <span className="muted">({pending.length})</span></strong>
          {pending.length > 0 && (
            <div className="row wrap">
              <button className="success sm" disabled={busy}
                onClick={() => decide({ session_id: session.id, all: true, decision: 'approve' }, 'Approved all')}>Approve all</button>
              <button className="ghost sm" disabled={busy}
                onClick={() => decide({ session_id: session.id, all: true, decision: 'reject' }, 'Rejected all')}>Reject all</button>
            </div>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>Students who tapped “present”. Verify each is in class, then approve. IP match is only a hint.</p>
        {pending.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>No students waiting right now.</p>
        ) : (
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id}>
                <div><strong>{p.student_name}</strong> <span className="muted small">{p.roll_no || ''} · Sec {p.section || '—'}</span>
                  <div className="small muted">IP match: {p.ip_ok ? 'Yes' : 'No'} · {p.ip_address || '—'}</div></div>
                <div className="spacer" />
                <button className="success sm" disabled={busy} onClick={() => decide({ id: p.id, decision: 'approve' }, 'Approved')}>Approve</button>
                <button className="ghost sm" disabled={busy} onClick={() => decide({ id: p.id, decision: 'reject' }, 'Reject')}>Reject</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showEnd ? (
        <div className="mt">
          <label>Message to admin (required to end an empty session)</label>
          <textarea value={endMsg} onChange={(e) => setEndMsg(e.target.value)} placeholder="e.g. No students showed up for this lecture." />
          <div className="row mt">
            <button className="danger-btn" disabled={busy || !endMsg.trim()} onClick={() => close(endMsg.trim())}>End empty session</button>
            <button className="ghost sm" onClick={() => setShowEnd(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row wrap mt">
          {noStudents ? (
            <button className="danger-btn" disabled={busy} onClick={() => setShowEnd(true)}>End empty session</button>
          ) : (
            <button className="danger-btn" disabled={busy} onClick={() => close()}>Close session</button>
          )}
        </div>
      )}
    </div>
  );
}
