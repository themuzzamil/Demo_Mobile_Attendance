-- Mobile Attendance System schema (v2: email auth, approval workflow, IP-only sessions)
-- NOTE: migrate.mjs drops the old tables first, so this is a clean rebuild.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- profile fields (role-dependent; null where not applicable)
  subject       TEXT,           -- teacher, student
  semester      TEXT,           -- student
  section       TEXT,           -- student
  roll_no       TEXT,           -- student
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- roll numbers unique among students that have one
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_roll_no
  ON users(roll_no) WHERE roll_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

-- An attendance window opened by a teacher. The teacher's public network IP is
-- captured here; students are "present" only if their public IP matches.
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id          SERIAL PRIMARY KEY,
  teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  semester    TEXT,
  section     TEXT,
  network_ip  TEXT NOT NULL,          -- teacher's detected public IP (the reference)
  server_ip   TEXT,                   -- server-seen IP (audit / cross-check)
  is_open     BOOLEAN NOT NULL DEFAULT TRUE,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_subject_open ON attendance_sessions(subject, is_open);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON attendance_sessions(teacher_id);

CREATE TABLE IF NOT EXISTS attendance (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('present', 'denied')),
  ip_address  TEXT,                   -- student's detected public IP (used for match)
  server_ip   TEXT,                   -- server-seen IP (audit)
  ip_ok       BOOLEAN,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
