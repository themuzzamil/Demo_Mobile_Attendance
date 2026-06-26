'use client';

const BASE = '/api';

function authHeaders() {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (path) => fetch(BASE + path, { headers: authHeaders() }).then(handle),
  post: (path, body) =>
    fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body || {}),
    }).then(handle),
  del: (path) =>
    fetch(BASE + path, { method: 'DELETE', headers: authHeaders() }).then(handle),
  download: async (path, filename) => {
    const res = await fetch(BASE + path, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Re-fetch the current user (and refreshed token) so status changes propagate.
export async function refreshUser() {
  try {
    const { user, token } = await api.get('/auth/me');
    if (token) localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
}

// Detect the device's real public IP via an external lookup, so the network
// check works in any environment (dev or production). Falls back to null.
let _cachedIp = null;
export async function getPublicIp() {
  if (_cachedIp) return _cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    _cachedIp = data.ip || null;
    return _cachedIp;
  } catch {
    return null;
  }
}

export const homePathFor = (user) =>
  !user ? '/login' : user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/student';
