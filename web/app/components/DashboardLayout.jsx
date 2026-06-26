'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/clientApi';
import Icon from './Icon';

// Futuristic responsive shell: fixed sidebar on desktop, off-canvas drawer on
// mobile. `nav` = [{ id, label, icon, count }]. Renders header + page content.
export default function DashboardLayout({ user, title, subtitle, nav, active, onNavigate, children }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function go(id) { onNavigate(id); setOpen(false); }
  function logout() { clearSession(); router.replace('/login'); }
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="side-brand">
          <span className="logo-dot" />
          <span>Attend<span className="grad">Net</span></span>
        </div>
        <nav className="side-nav">
          {nav.map((n) => (
            <button key={n.id} className={`side-item ${active === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {n.count > 0 && <span className="side-count">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <div className="avatar">{initials}</div>
            <div className="su-meta">
              <div className="su-name">{user?.name}</div>
              <div className="su-role">{user?.role}</div>
            </div>
          </div>
          <button className="side-logout" onClick={logout}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar2">
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={20} /></button>
          <div className="page-title">
            <h1>{title}</h1>
            {subtitle && <span className="sub">{subtitle}</span>}
          </div>
          <div className="top-user">
            <div className="avatar sm">{initials}</div>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
