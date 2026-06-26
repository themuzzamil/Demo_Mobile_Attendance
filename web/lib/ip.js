// IP helpers for the network-based attendance check.

export function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

// IP the server sees for this request (from the proxy/runtime). Used for audit
// and as a fallback when the client cannot report its own public IP.
export function getServerSeenIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return normalizeIp(xff);
  const real = request.headers.get('x-real-ip');
  if (real) return normalizeIp(real);
  return null;
}

// The effective public IP to use for matching: prefer the client-reported public
// IP (detected via an external lookup in the browser/app, so it is the real
// network IP in any environment), else fall back to the server-seen IP.
export function effectiveIp(clientReportedIp, request) {
  return normalizeIp(clientReportedIp) || getServerSeenIp(request);
}

// Two parties are on the same network if their public IPs are equal.
export function sameNetwork(ipA, ipB) {
  const a = normalizeIp(ipA);
  const b = normalizeIp(ipB);
  return !!a && !!b && a === b;
}
