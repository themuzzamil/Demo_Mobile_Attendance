'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, refreshUser, clearSession, homePathFor } from '@/lib/clientApi';

// Guards a page to a role, keeps the user fresh (so approval status updates),
// and renders the top bar. Children receive the current user via render-prop.
export default function Shell({ role, children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (!stored) {
      router.replace('/login');
      return;
    }
    if (stored.role !== role) {
      router.replace(homePathFor(stored));
      return;
    }
    setUser(stored);
    setReady(true);
    // refresh from server (status may have changed)
    refreshUser().then((u) => {
      if (!u) {
        clearSession();
        router.replace('/login');
      } else if (u.role !== role) {
        router.replace(homePathFor(u));
      } else {
        setUser(u);
      }
    });
  }, [role, router]);

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!ready || !user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">Attend<span>Net</span></div>
        <div className="who">
          <div className="name">{user.name}</div>
          <div>
            <span className="badge role">{user.role}</span>
          </div>
        </div>
        <button className="ghost sm" onClick={logout} style={{ color: '#cbd5e1' }}>
          Sign out
        </button>
      </header>
      <main className="content">{children(user, setUser)}</main>
    </div>
  );
}
