import { query } from './db.js';

// Send an in-site message to a single recipient. Best-effort: never throws into
// the request path.
export async function sendMessage({ toUserId, fromUserId = null, kind = 'info', body, refId = null }) {
  try {
    await query(
      `INSERT INTO messages (to_user_id, from_user_id, kind, body, ref_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [toUserId, fromUserId, kind, body, refId]
    );
  } catch (err) {
    console.error('Message send failed:', err.message);
  }
}

// Fan a message out to every approved admin (admin count is not locked to one).
export async function notifyAdmins({ fromUserId = null, kind = 'info', body, refId = null }) {
  try {
    const { rows } = await query("SELECT id FROM users WHERE role = 'admin' AND status = 'approved'");
    for (const r of rows) {
      await sendMessage({ toUserId: r.id, fromUserId, kind, body, refId });
    }
  } catch (err) {
    console.error('notifyAdmins failed:', err.message);
  }
}
