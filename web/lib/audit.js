import { query } from './db.js';
import { getServerSeenIp } from './ip.js';

// Best-effort audit log write; never throws into the request path.
export async function audit(request, userId, action, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, details, ip_address)
       VALUES ($1, $2, $3, $4)`,
      [userId ?? null, action, details, getServerSeenIp(request)]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
