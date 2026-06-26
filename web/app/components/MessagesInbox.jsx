'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/clientApi';

// Shared in-site inbox. Polls every 30s. `onUnread` (optional) reports the unread
// count up so a parent can show a badge on a nav tab.
export default function MessagesInbox({ onUnread }) {
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/messages');
      setMessages(d.messages);
      setUnread(d.unread);
      onUnread?.(d.unread);
    } catch {
      /* best-effort */
    }
  }, [onUnread]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function markAllRead() {
    try {
      await api.post('/messages', {});
      await load();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <h3 style={{ margin: 0 }}>
          Inbox {unread > 0 && <span className="muted small">({unread} unread)</span>}
        </h3>
        {unread > 0 && (
          <button className="secondary sm" onClick={markAllRead}>Mark all read</button>
        )}
      </div>
      {messages.length === 0 ? (
        <p className="muted small mt" style={{ margin: '0.75rem 0 0' }}>No messages.</p>
      ) : (
        <div className="mt">
          {messages.map((m) => (
            <div key={m.id} className={`inbox-item ${m.is_read ? 'read' : 'unread'}`}>
              <span className="dot" />
              <div>
                <div className="small">{m.body}</div>
                <div className="small muted">
                  {m.from_name ? `${m.from_name} · ` : ''}
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
