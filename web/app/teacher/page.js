'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import PendingScreen from '@/app/components/PendingScreen';
import MessagesInbox from '@/app/components/MessagesInbox';
import Countdown from '@/app/components/Countdown';
import { api, getPublicIp } from '@/lib/clientApi';

export default function TeacherPage() {
  return (
    <Shell role="teacher">
      {(user, setUser) =>
        user.status !== 'approved'
          ? <PendingScreen user={user} onUpdate={setUser} />
          : <TeacherHome user={user} />
      }
    </Shell>
  );
}

function TeacherHome({ user }) {
  const [tab, setTab] = useState('today');
  const [session, setSession] = useState(null);
  const [today, setToday] = useState([]);
  const [requests, setRequests] = useState([]);
  const [pending, setPending] = useState([]);
  const [records, setRecords] = useState([]);
  const [publicIp, setPublicIp] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 4000); };
  const fail = (e) => setError(e.message || String(e));

  const loadSession = useCallback(async () => { try { setSession((await api.get('/sessions/active')).session); } catch (e) { fail(e); } }, []);
  const loadToday = useCallback(async () => { try { setToday((await api.get('/timetable/today')).slots); } catch (e) { fail(e); } }, []);
  const loadRequests = useCallback(async () => { try { setRequests((await api.get('/permissions')).requests); } catch (e) { fail(e); } }, []);
  const loadPending = useCallback(async () => { try { setPending((await api.get('/users/pending')).pending); } catch (e) { fail(e); } }, []);
  const loadRecords = useCallback(async () => { try { setRecords((await api.get('/attendance')).attendance); } catch (e) { fail(e); } }, []);

  useEffect(() => {
    loadSession(); loadToday(); loadRequests(); loadPending(); loadRecords();
    getPublicIp().then(setPublicIp);
    const t = setInterval(() => { loadSession(); loadToday(); loadRequests(); }, 20000);
    return () => clearInterval(t);
  }, [loadSession, loadToday, loadRequests, loadPending, loadRecords]);

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
  async function decideStudent(id, action) {
    try { await api.post(`/users/${id}/${action}`, {}); await loadPending(); flash(`Student ${action}d.`); }
    catch (e) { fail(e); }
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const Tab = ({ id, label, count }) => (
    <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
      {label}{count > 0 && <span className="count">{count}</span>}
    </button>
  );

  return (
    <div>
      <div className="row between">
        <h2>Teacher Dashboard</h2>
        <div className="small muted">Subject: <strong>{user.subject}</strong></div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {session && (
        <ActiveSession session={session} busy={busy} setBusy={setBusy}
          onClosed={() => { loadSession(); loadToday(); loadRecords(); }} flash={flash} fail={fail} />
      )}

      <div className="tabnav">
        <Tab id="today" label="Today's classes" />
        <Tab id="requests" label="Late requests" count={pendingRequests.length} />
        <Tab id="students" label="Students" count={pending.length} />
        <Tab id="records" label="Records" />
        <Tab id="inbox" label="Inbox" count={unread} />
      </div>

      {tab === 'today' && (
        <div className="card">
          <h3>Today's classes</h3>
          <p className="small muted">Your network: <span className="ip-pill">{publicIp || 'detecting…'}</span> — captured as the reference when you start a class.</p>
          {today.length === 0 ? <p className="muted small">No classes scheduled for today.</p> : (
            <div className="slot-grid">
              {today.map((s) => (
                <div className="slot" key={s.slot_id}>
                  <div className="when">{String(s.start_time).slice(0, 5)} UTC · {s.subject}{s.section ? ` · ${s.section}` : ''}</div>
                  <div className="meta">{s.duration_minutes}m lecture · mark {s.mark_window_minutes}m · grace {s.start_grace_minutes}m</div>
                  {s.open_session ? (
                    <span className="badge approved">In progress</span>
                  ) : s.start_state === 'too_early' ? (
                    <span className="badge">Starts at {String(s.start_time).slice(0, 5)} UTC</span>
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

      {tab === 'students' && (
        <div className="card">
          <h3>Pending students <span className="muted small">({pending.length})</span></h3>
          {pending.length === 0 ? <p className="muted small">No students awaiting approval for {user.subject}.</p> : (
            <ul className="list">
              {pending.map((s) => (
                <li key={s.id}>
                  <div><strong>{s.name}</strong> <span className="muted small">({s.email})</span>
                    <div className="small muted">Roll {s.roll_no} · Sem {s.semester} · Sec {s.section}</div></div>
                  <div className="spacer" />
                  <button className="success sm" onClick={() => decideStudent(s.id, 'approve')}>Approve</button>
                  <button className="ghost sm" onClick={() => decideStudent(s.id, 'reject')}>Reject</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      {tab === 'inbox' && <MessagesInbox onUnread={setUnread} />}
    </div>
  );
}

function ActiveSession({ session, busy, setBusy, onClosed, flash, fail }) {
  const [endMsg, setEndMsg] = useState('');
  const [showEnd, setShowEnd] = useState(false);
  const noStudents = Number(session.present_count) === 0 && Number(session.late_count) === 0;

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
      </div>
      <p className="small muted mt">Network <span className="ip-pill">{session.network_ip}</span> · you are marked <span className={`badge ${session.teacher_status}`}>{session.teacher_status}</span></p>

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
