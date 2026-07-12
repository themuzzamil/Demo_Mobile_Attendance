'use client';
import { useState, useEffect, useCallback } from 'react';

// Dashboard tab state that survives a page refresh by mirroring the active tab in
// the URL hash (e.g. #courses). Dashboards mount client-only (Shell renders null
// until ready), so reading location.hash in the initializer is safe.
export function useTab(defaultId) {
  const [tab, setTabState] = useState(() => {
    if (typeof window === 'undefined') return defaultId;
    return window.location.hash.slice(1) || defaultId;
  });

  useEffect(() => {
    const onHash = () => setTabState(window.location.hash.slice(1) || defaultId);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [defaultId]);

  const setTab = useCallback((id) => {
    setTabState(id);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${id}`);
  }, []);

  return [tab, setTab];
}
