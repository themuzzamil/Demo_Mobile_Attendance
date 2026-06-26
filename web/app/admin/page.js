'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell from '@/app/components/Shell';
import { api } from '@/lib/clientApi';

export default function AdminPage() {
  return <Shell role="admin">{(user) => <AdminHome user={user} />}</Shell>;
}

function AdminHome({ user }) {
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const loadPending = useCallback(async () => {
    try { setPending((await api.get('/users/pending')).pending); }
    catch (e) { setError(e.message); }
  }, []);
  const loadUsers = useCallback(async () => {
    try { setUsers((await api.get('/users')).users); }
    catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { loadPending(); loadUsers(); }, [loadPending, loadUsers]);

  async function decide(id, action) {
    setError(''); setMsg('');
    try {
      await api.post(`/users/${id}/${action}`, {});
      await loadPending(); await loadUsers();
      setMsg(`Teacher ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (e) { setError(e.message); }
  }

  async function remove(id) {
    if (!confirm('Delete this account permanently?')) return;
    try { await api.del(`/users/${id}`); await loadUsers(); }
    catch (e) { setError(e.message); }
  }

  const counts = users.reduce(
    (acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; },
    {}
  );

  return (
    <div>
      <h2>Admin Dashboard</h2>
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      <div className="card">
        <div className="stat">
          <div className="item"><div className="n">{counts.teacher || 0}</div><div className="l">Teachers</div></div>
          <div className="item"><div className="n">{counts.student || 0}</div><div className="l">Students</div></div>
          <div className="item"><div className="n">{pending.length}</div><div className="l">Pending teachers</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Pending teacher approvals <span className="muted small">({pending.length})</span></h3>
        {pending.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>No teachers awaiting approval.</p>
        ) : (
          <ul className="list">
            {pending.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.name}</strong> <span className="muted small">({t.email})</span>
                  <div className="small muted">Subject: {t.subject}</div>
                </div>
                <div className="spacer" />
                <button className="success sm" onClick={() => decide(t.id, 'approve')}>Approve</button>
                <button className="ghost sm" onClick={() => decide(t.id, 'reject')}>Reject</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>All users</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Role</th><th>Email</th><th>Subject</th>
                <th>Roll/Sec</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td><span className="badge role">{u.role}</span></td>
                  <td className="small">{u.email}</td>
                  <td>{u.subject || '—'}</td>
                  <td className="small">{u.roll_no ? `${u.roll_no} / ${u.section || '-'}` : '—'}</td>
                  <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                  <td>
                    {u.id !== user.id && (
                      <button className="link danger" onClick={() => remove(u.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="7" className="center muted">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
