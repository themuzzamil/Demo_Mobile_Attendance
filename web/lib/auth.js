import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Read + verify the bearer token from a Next.js Request. Returns user or null.
export function getAuth(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

// Guard: requires a valid token and (optionally) one of the given roles.
// Returns { user } or { error, status }.
export function requireRole(request, ...roles) {
  const user = getAuth(request);
  if (!user) return { error: 'Authentication required', status: 401 };
  if (roles.length && !roles.includes(user.role)) {
    return { error: 'Insufficient permissions', status: 403 };
  }
  return { user };
}

// Like requireRole but also requires the account to be approved (admins always pass).
export function requireApproved(request, ...roles) {
  const res = requireRole(request, ...roles);
  if (res.error) return res;
  if (res.user.role !== 'admin' && res.user.status !== 'approved') {
    return { error: 'Your account is awaiting approval', status: 403 };
  }
  return res;
}

export function toPublicUser(u) {
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    status: u.status,
    subject: u.subject ?? null,
    semester: u.semester ?? null,
    section: u.section ?? null,
    roll_no: u.roll_no ?? null,
  };
}
