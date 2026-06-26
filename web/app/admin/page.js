'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import DashboardLayout from '@/app/components/DashboardLayout';
import MessagesInbox from '@/app/components/MessagesInbox';
import { api } from '@/lib/clientApi';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AdminPage() {
  return <Shell role="admin">{(user) => <AdminHome user={user} />}</Shell>;
}

function AdminHome({ user }) {
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [slots, setSlots] = useState([]);
  const [requests, setRequests] = useState([]);
  const [unread, setUnread] = useState(0);

  const flash = (m) => { setMsg(m); setError(''); setTimeout(() => setMsg(''), 4000); };
  const fail = (e) => setError(e.message || String(e));

  const loadOverview = useCallback(async () => { try { setOverview(await api.get('/admin/overview')); } catch (e) { fail(e); } }, []);
  const loadPending = useCallback(async () => { try { setPending((await api.get('/users/pending')).pending); } catch (e) { fail(e); } }, []);
  const loadUsers = useCallback(async () => { try { setUsers((await api.get('/users')).users); } catch (e) { fail(e); } }, []);
  const loadCourses = useCallback(async () => { try { setCourses((await api.get('/courses')).courses); } catch (e) { fail(e); } }, []);
  const loadOfferings = useCallback(async () => { try { setOfferings((await api.get('/offerings')).offerings); } catch (e) { fail(e); } }, []);
  const loadSlots = useCallback(async () => { try { setSlots((await api.get('/timetable')).slots); } catch (e) { fail(e); } }, []);
  const loadRequests = useCallback(async () => { try { setRequests((await api.get('/permissions')).requests); } catch (e) { fail(e); } }, []);

  useEffect(() => {
    loadOverview(); loadPending(); loadUsers(); loadCourses(); loadOfferings(); loadSlots(); loadRequests();
  }, [loadOverview, loadPending, loadUsers, loadCourses, loadOfferings, loadSlots, loadRequests]);

  const teachers = users.filter((u) => u.role === 'teacher' && u.status === 'approved');
  const students = users.filter((u) => u.role === 'student' && u.status === 'approved');
  const pendingRequests = requests.filter((r) => r.status === 'pending');

  async function decideUser(id, action) {
    try { await api.post(`/users/${id}/${action}`, {}); await loadPending(); await loadUsers(); flash(`Teacher ${action}d.`); } catch (e) { fail(e); }
  }
  async function removeUser(id) {
    if (!confirm('Delete this account permanently?')) return;
    try { await api.del(`/users/${id}`); await loadUsers(); } catch (e) { fail(e); }
  }
  async function decideRequest(id, decision) {
    try { await api.post(`/permissions/${id}`, { decision }); await loadRequests(); flash(`Request ${decision}d.`); } catch (e) { fail(e); }
  }

  const nav = [
    { id: 'overview', label: 'Overview', icon: 'overview' },
    { id: 'approvals', label: 'Approvals', icon: 'approvals', count: pending.length },
    { id: 'courses', label: 'Courses', icon: 'course' },
    { id: 'offerings', label: 'Offerings', icon: 'offering' },
    { id: 'timetable', label: 'Timetable', icon: 'timetable' },
    { id: 'requests', label: 'Requests', icon: 'bell', count: pendingRequests.length },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', count: unread },
    { id: 'users', label: 'Users', icon: 'users' },
  ];

  return (
    <DashboardLayout user={user} title="Admin" subtitle="Control center" nav={nav} active={tab} onNavigate={setTab}>
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {tab === 'overview' && <Overview overview={overview} />}
      {tab === 'approvals' && <Approvals pending={pending} onDecide={decideUser} />}
      {tab === 'courses' && <Courses courses={courses} onChange={() => { loadCourses(); loadOverview(); }} flash={flash} fail={fail} />}
      {tab === 'offerings' && (
        <Offerings offerings={offerings} courses={courses} teachers={teachers} students={students}
                   onChange={() => { loadOfferings(); loadOverview(); }} flash={flash} fail={fail} />
      )}
      {tab === 'timetable' && <Timetable slots={slots} offerings={offerings} onChange={loadSlots} flash={flash} fail={fail} />}
      {tab === 'requests' && <Requests requests={requests} onDecide={decideRequest} />}
      {tab === 'inbox' && <MessagesInbox onUnread={setUnread} />}
      {tab === 'users' && <Users users={users} meId={user.id} onRemove={removeUser} />}
    </DashboardLayout>
  );
}

function Overview({ overview }) {
  if (!overview) return <div className="card"><p className="muted">Loading…</p></div>;
  const t = overview.totals || {};
  return (
    <>
      <div className="card">
        <div className="stat">
          <div className="item"><div className="n">{t.teachers || 0}</div><div className="l">Teachers</div></div>
          <div className="item"><div className="n">{t.students || 0}</div><div className="l">Students</div></div>
          <div className="item"><div className="n">{t.courses || 0}</div><div className="l">Courses</div></div>
          <div className="item"><div className="n">{t.offerings || 0}</div><div className="l">Offerings</div></div>
          <div className="item"><div className="n">{t.open_sessions || 0}</div><div className="l">Open now</div></div>
          <div className="item"><div className="n">{t.pending_requests || 0}</div><div className="l">Pending reqs</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Per-teacher activity</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Teacher</th><th>Offerings</th><th>Sessions run</th><th>Total present marks</th></tr></thead>
            <tbody>
              {(overview.per_teacher || []).map((r) => (
                <tr key={r.id}><td>{r.name}</td><td>{r.offerings}</td><td>{r.sessions_run}</td><td>{r.total_present}</td></tr>
              ))}
              {(overview.per_teacher || []).length === 0 && <tr><td colSpan="4" className="center muted">No teachers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Recent sessions</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Course</th><th>Teacher</th><th>T.status</th><th>Present</th><th>Late</th><th>Absent</th><th>Denied</th></tr></thead>
            <tbody>
              {(overview.sessions || []).map((s) => (
                <tr key={s.id}>
                  <td className="small">{new Date(s.opened_at).toLocaleString()}</td>
                  <td>{s.subject}{s.section ? ` · ${s.section}` : ''}</td>
                  <td>{s.teacher_name}</td>
                  <td><span className={`badge ${s.teacher_status || ''}`}>{s.teacher_status || '—'}</span></td>
                  <td>{s.present}</td><td>{s.late}</td><td>{s.absent}</td><td>{s.denied}</td>
                </tr>
              ))}
              {(overview.sessions || []).length === 0 && <tr><td colSpan="8" className="center muted">No sessions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Audit log</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>IP</th></tr></thead>
            <tbody>
              {(overview.logs || []).map((l) => (
                <tr key={l.id}>
                  <td className="small">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="small">{l.user_name || '—'} {l.user_role && <span className="badge role">{l.user_role}</span>}</td>
                  <td className="small mono">{l.action}</td>
                  <td className="small mono">{l.ip_address || '—'}</td>
                </tr>
              ))}
              {(overview.logs || []).length === 0 && <tr><td colSpan="4" className="center muted">No activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Approvals({ pending, onDecide }) {
  return (
    <div className="card">
      <h3>Pending teacher approvals <span className="muted small">({pending.length})</span></h3>
      {pending.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No teachers awaiting approval.</p> : (
        <ul className="list">
          {pending.map((t) => (
            <li key={t.id}>
              <div><strong>{t.name}</strong> <span className="muted small">({t.email})</span>
                <div className="small muted">Subject: {t.subject}</div></div>
              <div className="spacer" />
              <button className="success sm" onClick={() => onDecide(t.id, 'approve')}>Approve</button>
              <button className="ghost sm" onClick={() => onDecide(t.id, 'reject')}>Reject</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Courses({ courses, onChange, flash, fail }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [credit, setCredit] = useState('');

  async function create(e) {
    e.preventDefault();
    try {
      await api.post('/courses', { code, title, credit_hours: credit || null });
      setCode(''); setTitle(''); setCredit(''); flash('Course added.'); onChange();
    } catch (err) { fail(err); }
  }

  return (
    <>
      <div className="card">
        <h3>Add course to catalog</h3>
        <form onSubmit={create}>
          <div className="grid2">
            <div className="field"><label>Course code *</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CS-301" required /></div>
            <div className="field"><label>Title *</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Information Security" required /></div>
            <div className="field"><label>Credit hours</label><input type="number" min="1" max="6" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="3" /></div>
          </div>
          <button type="submit">Add course</button>
        </form>
      </div>
      <div className="card">
        <h3>Course catalog <span className="muted small">({courses.length})</span></h3>
        {courses.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No courses yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Offerings</th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}><td className="mono">{c.code}</td><td>{c.title}</td><td>{c.credit_hours || '—'}</td><td>{c.offering_count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Offerings({ offerings, courses, teachers, students, onChange, flash, fail }) {
  const [courseId, setCourseId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [term, setTerm] = useState('');
  const [semester, setSemester] = useState('');
  const [section, setSection] = useState('');
  const [openRoster, setOpenRoster] = useState(null);

  async function create(e) {
    e.preventDefault();
    try {
      await api.post('/offerings', { course_id: Number(courseId), teacher_id: teacherId || null, term, semester, section });
      setCourseId(''); setTeacherId(''); setSemester(''); setSection(''); flash('Offering created.'); onChange();
    } catch (err) { fail(err); }
  }

  return (
    <>
      <div className="card">
        <h3>Create offering (assign a teacher to a course-section)</h3>
        {courses.length === 0 ? <div className="alert info">Add a course to the catalog first.</div> : (
          <form onSubmit={create}>
            <div className="grid2">
              <div className="field"><label>Course *</label>
                <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
                  <option value="">Select course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                </select>
              </div>
              <div className="field"><label>Teacher *</label>
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                  <option value="">Select teacher…</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Term *</label><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Fall 2026" required /></div>
              <div className="field"><label>Semester</label><input value={semester} onChange={(e) => setSemester(e.target.value)} placeholder="e.g. 6" /></div>
              <div className="field"><label>Section</label><input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. B" /></div>
            </div>
            <button type="submit">Create offering</button>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Offerings <span className="muted small">({offerings.length})</span></h3>
        {offerings.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No offerings yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Course</th><th>Sec</th><th>Term</th><th>Teacher</th><th>Students</th><th></th></tr></thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={o.id}>
                    <td><span className="mono">{o.code}</span> {o.title}</td>
                    <td>{o.section || '—'}</td><td className="small">{o.term}</td>
                    <td>{o.teacher_name || '—'}</td><td>{o.student_count}</td>
                    <td><button className="link" onClick={() => setOpenRoster(openRoster === o.id ? null : o.id)}>{openRoster === o.id ? 'Close' : 'Roster'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {openRoster && <Roster offeringId={openRoster} students={students} onChange={onChange} flash={flash} fail={fail} />}
      </div>
    </>
  );
}

function Roster({ offeringId, students, onChange, flash, fail }) {
  const [enrolled, setEnrolled] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [bSem, setBSem] = useState('');
  const [bSec, setBSec] = useState('');

  const load = useCallback(async () => {
    try { setEnrolled((await api.get(`/offerings/${offeringId}/enroll`)).students); } catch (e) { fail(e); }
  }, [offeringId, fail]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!studentId) return;
    try { await api.post(`/offerings/${offeringId}/enroll`, { student_id: Number(studentId) }); setStudentId(''); await load(); onChange(); flash('Enrolled.'); } catch (e) { fail(e); }
  }
  async function bulk() {
    if (!bSem && !bSec) return;
    try { const r = await api.post(`/offerings/${offeringId}/enroll`, { bulk: true, semester: bSem, section: bSec }); await load(); onChange(); flash(`Bulk enrolled ${r.added} student(s).`); } catch (e) { fail(e); }
  }
  async function remove(sid) {
    try { await api.del(`/offerings/${offeringId}/enroll`, { student_id: sid }); await load(); onChange(); } catch (e) { fail(e); }
  }
  const enrolledIds = new Set(enrolled.map((s) => s.id));
  const available = students.filter((s) => !enrolledIds.has(s.id));

  return (
    <div className="mt" style={{ borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
      <div className="row wrap">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Add student…</option>
          {available.map((s) => <option key={s.id} value={s.id}>{s.name} {s.roll_no ? `(${s.roll_no})` : ''}</option>)}
        </select>
        <button className="sm" onClick={add} disabled={!studentId}>Enroll</button>
      </div>
      <div className="row wrap mt">
        <span className="small muted">Bulk:</span>
        <input value={bSem} onChange={(e) => setBSem(e.target.value)} placeholder="Semester" style={{ maxWidth: 130 }} />
        <input value={bSec} onChange={(e) => setBSec(e.target.value)} placeholder="Section" style={{ maxWidth: 130 }} />
        <button className="secondary sm" onClick={bulk} disabled={!bSem && !bSec}>Enroll all matching</button>
      </div>
      {enrolled.length === 0 ? <p className="muted small mt">No students enrolled.</p> : (
        <ul className="list mt">
          {enrolled.map((s) => (
            <li key={s.id}>
              <div><strong>{s.name}</strong> <span className="muted small">{s.roll_no} · Sem {s.semester || '—'} · Sec {s.section || '—'}</span></div>
              <div className="spacer" />
              <button className="link danger" onClick={() => remove(s.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Timetable({ slots, offerings, onChange, flash, fail }) {
  const [offeringId, setOfferingId] = useState('');
  const [dow, setDow] = useState('0');
  const [startTime, setStartTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [markWindow, setMarkWindow] = useState('15');
  const [grace, setGrace] = useState('15');

  async function create(e) {
    e.preventDefault();
    try {
      await api.post('/timetable', {
        offering_id: Number(offeringId), day_of_week: Number(dow), start_time: startTime,
        duration_minutes: Number(duration), mark_window_minutes: Number(markWindow), start_grace_minutes: Number(grace),
      });
      flash('Slot added.'); onChange();
    } catch (err) { fail(err); }
  }
  async function remove(id) {
    if (!confirm('Remove this timetable slot?')) return;
    try { await api.del(`/timetable/${id}`); onChange(); } catch (e) { fail(e); }
  }

  return (
    <>
      <div className="card">
        <h3>Add timetable slot</h3>
        {offerings.length === 0 ? <div className="alert info">Create a course offering first.</div> : (
          <form onSubmit={create}>
            <div className="grid2">
              <div className="field"><label>Offering (course · section) *</label>
                <select value={offeringId} onChange={(e) => setOfferingId(e.target.value)} required>
                  <option value="">Select offering…</option>
                  {offerings.map((o) => <option key={o.id} value={o.id}>{o.code}{o.section ? ` · ${o.section}` : ''} · {o.term} — {o.teacher_name || 'no teacher'}</option>)}
                </select>
              </div>
              <div className="field"><label>Day *</label>
                <select value={dow} onChange={(e) => setDow(e.target.value)}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              </div>
              <div className="field"><label>Start time (PKT) *</label><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></div>
              <div className="field"><label>Lecture duration (min)</label><input type="number" min="5" value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
              <div className="field"><label>Marking window (min)</label><input type="number" min="1" value={markWindow} onChange={(e) => setMarkWindow(e.target.value)} /></div>
              <div className="field"><label>Teacher start grace (min)</label><input type="number" min="1" value={grace} onChange={(e) => setGrace(e.target.value)} /></div>
            </div>
            <button type="submit">Add slot</button>
            <p className="small muted mt">Times are in Pakistan time (PKT, UTC+5). Adding the offering auto-attaches its teacher and enrolled students. Overlapping slots for the same teacher or section are blocked.</p>
          </form>
        )}
      </div>

      <div className="card">
        <h3>Weekly timetable <span className="muted small">({slots.length})</span></h3>
        {slots.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No slots yet.</p> : (
          <div className="slot-grid">
            {slots.map((s) => (
              <div className="slot" key={s.id}>
                <div className="when">{s.day_name} · {String(s.start_time).slice(0, 5)} PKT</div>
                <div className="meta"><span className="mono">{s.code}</span> {s.title}{s.section ? ` · Sec ${s.section}` : ''}<br />
                  {s.teacher_name} · {s.duration_minutes}m · mark {s.mark_window_minutes}m · grace {s.start_grace_minutes}m</div>
                <button className="link danger" onClick={() => remove(s.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Requests({ requests, onDecide }) {
  return (
    <div className="card">
      <h3>Teacher late-start requests</h3>
      {requests.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No requests.</p> : (
        <ul className="list">
          {requests.map((r) => (
            <li key={r.id}>
              <div>
                <strong>{r.requester_name}</strong> — {r.subject || 'class'}{' '}
                {r.start_time && <span className="muted small">({DAYS[r.day_of_week]} {String(r.start_time).slice(0, 5)} PKT)</span>}
                {r.reason && <div className="small muted">“{r.reason}”</div>}
              </div>
              <div className="spacer" />
              {r.status === 'pending' ? (
                <>
                  <button className="success sm" onClick={() => onDecide(r.id, 'approve')}>Approve</button>
                  <button className="ghost sm" onClick={() => onDecide(r.id, 'reject')}>Reject</button>
                </>
              ) : <span className={`badge ${r.status === 'approved' || r.status === 'used' ? 'approved' : 'rejected'}`}>{r.status}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Users({ users, meId, onRemove }) {
  return (
    <div className="card">
      <h3>All users</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Subject</th><th>Roll/Sec</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td><span className="badge role">{u.role}</span></td>
                <td className="small">{u.email}</td><td>{u.subject || '—'}</td>
                <td className="small">{u.roll_no ? `${u.roll_no} / ${u.section || '-'}` : '—'}</td>
                <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                <td>{u.id !== meId && <button className="link danger" onClick={() => onRemove(u.id)}>Delete</button>}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan="7" className="center muted">No users yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
