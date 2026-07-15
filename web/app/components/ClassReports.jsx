'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/clientApi';

// Attendance reports for a class (course offering). Shared by teacher & admin.
//   role="teacher" -> the API already scopes to their own classes
//   role="admin"   -> every class, with the teacher's name shown
// canDecide lets the teacher approve/reject pending marks straight from a session.
export default function ClassReports({ role, flash, fail, canDecide = true }) {
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState(null);
  const [openSession, setOpenSession] = useState(null); // { id, session, students }
  const [busy, setBusy] = useState(false);

  const loadClasses = useCallback(async () => {
    try { setClasses((await api.get('/reports/classes')).classes); } catch (e) { fail(e); }
  }, [fail]);

  const loadReport = useCallback(async (id) => {
    if (!id) { setReport(null); return; }
    try { setReport(await api.get(`/reports/classes/${id}`)); } catch (e) { fail(e); }
  }, [fail]);

  const loadSession = useCallback(async (id) => {
    try { setOpenSession(await api.get(`/reports/session/${id}`)); } catch (e) { fail(e); }
  }, [fail]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  function pickClass(id) {
    setSelectedId(id);
    setOpenSession(null);
    loadReport(id);
  }

  async function toggleSession(id) {
    if (openSession?.session?.id === id) { setOpenSession(null); return; }
    await loadSession(id);
  }

  async function decide(body, label) {
    setBusy(true);
    try {
      const r = await api.post('/attendance/decide', body);
      flash(`${label} — ${r.decided} record(s) updated.`);
      if (openSession?.session?.id) await loadSession(openSession.session.id);
      await loadReport(selectedId);
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  const selected = classes.find((c) => String(c.offering_id) === String(selectedId));

  // Roster export for the selected class. The server names the file; we pass a
  // sensible fallback for browsers that ignore Content-Disposition.
  async function download(fmt) {
    const stem = selected ? `${selected.code}-${selected.section || 'all'}-roster` : 'class-roster';
    try {
      await api.download(`/reports/classes/${selectedId}/${fmt}`, `${stem}.${fmt}`);
    } catch (e) { fail(e); }
  }

  async function downloadSession(fmt) {
    const s = openSession?.session;
    if (!s) return;
    const day = new Date(s.opened_at).toISOString().slice(0, 10);
    try {
      await api.download(`/reports/session/${s.id}/${fmt}`, `${s.code || s.subject}-${day}.${fmt}`);
    } catch (e) { fail(e); }
  }

  return (
    <>
      <div className="card">
        <h3>Class attendance report</h3>
        {classes.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>No classes to report on yet.</p>
        ) : (
          <div className="field" style={{ maxWidth: 460 }}>
            <label>Select a class</label>
            <select value={selectedId} onChange={(e) => pickClass(e.target.value)}>
              <option value="">Choose a class…</option>
              {classes.map((c) => (
                <option key={c.offering_id} value={c.offering_id}>
                  {c.code} — {c.title}{c.section ? ` · Sec ${c.section}` : ''} · {c.term}
                  {role === 'admin' && c.teacher_name ? ` — ${c.teacher_name}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {selected && (
          <div className="stat mt">
            <div className="item"><div className="n">{selected.enrolled_count}</div><div className="l">Enrolled</div></div>
            <div className="item"><div className="n">{selected.sessions_held}</div><div className="l">Classes held</div></div>
            {role === 'admin' && (
              <div className="item"><div className="n" style={{ fontSize: '1rem' }}>{selected.teacher_name || '—'}</div><div className="l">Teacher</div></div>
            )}
          </div>
        )}
      </div>

      {report && (
        <>
          <div className="card">
            <div className="row between wrap">
              <h3 style={{ margin: 0 }}>Enrolled students <span className="muted small">({report.enrolled_count})</span></h3>
              <div className="row wrap">
                <button className="secondary sm" onClick={() => download('csv')}>Download CSV</button>
                <button className="secondary sm" onClick={() => download('pdf')}>Download PDF</button>
              </div>
            </div>
            <div className="table-wrap mt">
              <table className="table">
                <thead>
                  <tr><th>Roll / ID</th><th>Name</th><th>Sec</th><th>Present</th><th>Late</th><th>Absent</th><th>Pending</th><th>Attendance %</th></tr>
                </thead>
                <tbody>
                  {report.roster.map((s) => {
                    const pct = s.percentage;
                    const cls = pct === null ? '' : pct >= 75 ? 'present' : pct >= 50 ? 'late' : 'denied';
                    return (
                      <tr key={s.student_id}>
                        <td className="mono small">{s.roll_no || '—'}</td>
                        <td>{s.name}</td>
                        <td>{s.section || '—'}</td>
                        <td>{s.present}</td>
                        <td>{s.late}</td>
                        <td>{s.absent}</td>
                        <td>{s.pending > 0 ? <span className="badge pending">{s.pending}</span> : 0}</td>
                        <td><span className={`pct-badge ${cls}`}>{pct === null ? '—' : `${pct}%`}</span></td>
                      </tr>
                    );
                  })}
                  {report.roster.length === 0 && <tr><td colSpan="8" className="center muted">No students enrolled.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3>Classes held <span className="muted small">({report.sessions.length})</span></h3>
            {report.sessions.length === 0 ? (
              <p className="muted small" style={{ margin: 0 }}>No classes have been held for this offering yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>When</th><th>Status</th><th>Present</th><th>Late</th><th>Absent</th><th>Pending</th><th></th></tr>
                  </thead>
                  <tbody>
                    {report.sessions.map((s) => (
                      <tr key={s.id}>
                        <td className="small">{new Date(s.opened_at).toLocaleString()}</td>
                        <td>{s.is_open ? <span className="badge pending">open</span> : <span className="badge approved">closed</span>}</td>
                        <td>{s.present}</td>
                        <td>{s.late}</td>
                        <td>{s.absent}</td>
                        <td>{s.pending > 0 ? <span className="badge pending">{s.pending}</span> : 0}</td>
                        <td>
                          <button className="link" onClick={() => toggleSession(s.id)}>
                            {openSession?.session?.id === s.id ? 'Hide' : 'View students'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {openSession && (
              <SessionDetail
                data={openSession} busy={busy} canDecide={canDecide}
                onDecide={decide} onDownload={downloadSession}
              />
            )}
          </div>
        </>
      )}
    </>
  );
}

const STATUS_LABEL = {
  present: 'Present', late: 'Late', absent: 'Absent',
  denied: 'Rejected', pending: 'Pending', not_marked: 'Not marked',
};

function SessionDetail({ data, busy, canDecide, onDecide, onDownload }) {
  const { session, students } = data;
  const pendingCount = students.filter((s) => s.status === 'pending').length;

  return (
    <div className="mt" style={{ borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
      <div className="row between wrap">
        <strong className="small">
          {session.code ? <span className="mono">{session.code}</span> : session.subject} · {new Date(session.opened_at).toLocaleString()}
        </strong>
        <div className="row wrap">
          {canDecide && pendingCount > 0 && (
            <>
              <button className="success sm" disabled={busy}
                onClick={() => onDecide({ session_id: session.id, all: true, decision: 'approve' }, 'Approved all pending')}>
                Approve all ({pendingCount})
              </button>
              <button className="ghost sm" disabled={busy}
                onClick={() => onDecide({ session_id: session.id, all: true, decision: 'reject' }, 'Rejected all pending')}>
                Reject all
              </button>
            </>
          )}
          <button className="secondary sm" onClick={() => onDownload('csv')}>CSV</button>
          <button className="secondary sm" onClick={() => onDownload('pdf')}>PDF</button>
        </div>
      </div>
      <div className="table-wrap mt">
        <table className="table">
          <thead>
            <tr><th>Roll / ID</th><th>Name</th><th>Status</th><th>IP match</th><th>Marked at</th>{canDecide && <th>Action</th>}</tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.student_id} className={s.status === 'denied' || s.status === 'absent' ? 'denied-row' : ''}>
                <td className="mono small">{s.roll_no || '—'}</td>
                <td>{s.name}</td>
                <td><span className={`badge ${s.status === 'not_marked' ? 'absent' : s.status}`}>{STATUS_LABEL[s.status] || s.status}</span></td>
                <td>{s.attendance_id ? (s.ip_ok ? 'Yes' : 'No') : '—'}</td>
                <td className="small">{s.created_at ? new Date(s.created_at).toLocaleTimeString() : '—'}</td>
                {canDecide && (
                  <td>
                    {s.status === 'pending' ? (
                      <>
                        <button className="success sm" disabled={busy}
                          onClick={() => onDecide({ id: s.attendance_id, decision: 'approve' }, 'Approved')}>Approve</button>
                        <button className="ghost sm" disabled={busy} style={{ marginLeft: 6 }}
                          onClick={() => onDecide({ id: s.attendance_id, decision: 'reject' }, 'Rejected')}>Reject</button>
                      </>
                    ) : s.attendance_id && (s.status === 'present' || s.status === 'late' || s.status === 'denied') ? (
                      <button className="link" disabled={busy}
                        onClick={() => onDecide({ id: s.attendance_id, decision: s.status === 'denied' ? 'approve' : 'reject' }, 'Updated')}>
                        {s.status === 'denied' ? 'Approve' : 'Revoke'}
                      </button>
                    ) : '—'}
                  </td>
                )}
              </tr>
            ))}
            {students.length === 0 && <tr><td colSpan={canDecide ? 6 : 5} className="center muted">No enrolled students.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
