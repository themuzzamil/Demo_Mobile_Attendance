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

  if (!ready || !user) return null;

  // Auth guard only — page chrome (sidebar/header) is provided by DashboardLayout.
  return children(user, setUser);
}
