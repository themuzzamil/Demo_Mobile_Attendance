'use client';
import { refreshUser } from '@/lib/clientApi';
import { useState } from 'react';

export default function PendingScreen({ user, onUpdate }) {
  const [checking, setChecking] = useState(false);
  const rejected = user.status === 'rejected';

  async function recheck() {
    setChecking(true);
    const u = await refreshUser();
    setChecking(false);
    if (u) onUpdate(u);
  }

  return (
    <div className="card" style={{ maxWidth: 560, margin: '2rem auto' }}>
      <h3>{rejected ? 'Account not approved' : 'Awaiting approval'}</h3>
      {rejected ? (
        <div className="alert error">
          Your account has been rejected. Please contact your administrator.
        </div>
      ) : (
        <div className="alert warn">
          {user.role === 'teacher'
            ? 'Your teacher account is pending administrator approval.'
            : `Your student account is pending approval by a teacher of "${user.subject}".`}
        </div>
      )}
      <p className="muted small">
        You can sign in, but attendance features unlock once your account is approved.
      </p>
      {!rejected && (
        <button className="secondary" onClick={recheck} disabled={checking}>
          {checking ? 'Checking…' : 'Check approval status'}
        </button>
      )}
    </div>
  );
}
