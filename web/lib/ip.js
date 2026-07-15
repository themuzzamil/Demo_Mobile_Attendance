// IP helpers for the network-based attendance check.
//
// SECURITY: the IP used for the class-network check must come from the platform,
// never from the request body. Earlier this preferred a client-reported value, so
// anyone could ask a friend in class for the class IP and POST it to mark from
// anywhere. The body value is now only a last-resort fallback for local dev,
// where there is no proxy to report a real public IP.
import ipaddr from 'ipaddr.js';

export function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

// Addresses that can never identify a class network: they mean no proxy reported
// a real client address (local dev), not that the caller is somewhere exotic.
const NON_ROUTABLE = new Set([
  'loopback', 'private', 'linkLocal', 'unspecified', 'broadcast', 'multicast',
]);

// A routable address — i.e. something a proxy plausibly reported as the real
// client. Deliberately NOT `range() === 'unicast'`: ipaddr.js also labels ranges
// such as 203.0.113.0/24 as 'reserved', and treating those as non-routable would
// make us fall back to the client-supplied IP — the very value we must not trust.
export function isPublicIp(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return false;
  try {
    return !NON_ROUTABLE.has(ipaddr.parse(ip).range());
  } catch {
    return false;
  }
}

// IP the server sees for this request (from the proxy/runtime). Used for audit
// and as a fallback when the client cannot report its own public IP.
export function getServerSeenIp(request) {
  // Order matters: request.ip is populated by Vercel with the true client IP and
  // cannot be forged by the caller, so it is tried first and wins in production.
  // The headers are only reached when request.ip isn't a routable address, i.e.
  // when we're behind our own proxy or running locally.
  const candidates = [
    request.ip,
    request.headers.get('x-real-ip'),
    request.headers.get('x-forwarded-for'),
  ]
    .map(normalizeIp)
    .filter(Boolean);
  // Prefer the first routable address. A loopback/private value only means there
  // is no proxy in front of us (local dev) — it must not shadow a real one.
  return candidates.find(isPublicIp) || candidates[0] || null;
}

// The authoritative public IP for this request.
//   production -> whatever the platform reports (client cannot influence it)
//   local dev  -> no proxy, so fall back to the browser-detected public IP
// `clientReportedIp` is ONLY consulted when the platform gives us nothing
// routable, so it can never override a real server-seen address.
export function trustedIp(request, clientReportedIp) {
  const seen = getServerSeenIp(request);
  if (isPublicIp(seen)) return seen;
  const reported = normalizeIp(clientReportedIp);
  if (isPublicIp(reported)) return reported;
  return seen || reported || null;
}

// Kept for callers that only want the raw server view (audit trail).
export function effectiveIp(clientReportedIp, request) {
  return trustedIp(request, clientReportedIp);
}

// Two parties are on the same network if their public IPs are equal.
export function sameNetwork(ipA, ipB) {
  const a = normalizeIp(ipA);
  const b = normalizeIp(ipB);
  return !!a && !!b && a === b;
}
