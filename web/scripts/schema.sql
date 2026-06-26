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
  status      TEXT NOT NULL CHECK (status IN ('present', 'denied', 'late', 'absent')),
  attendee_role TEXT NOT NULL DEFAULT 'student' CHECK (attendee_role IN ('student', 'teacher')),
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

-- ============================================================================
-- v3: roster, timetable, escalation/permission workflow, in-site messaging.
-- Everything below is additive + idempotent so it migrates an existing DB
-- (run `npm run migrate`, no --reset needed) without wiping users/data.
-- ============================================================================

-- v4 — course catalog: a subject with a code, defined once.
CREATE TABLE IF NOT EXISTS courses (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,        -- e.g. "CS-301"
  title        TEXT NOT NULL,               -- e.g. "Information Security"
  credit_hours INTEGER,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- admin
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Course offering (section): one teacher teaching a course to a section in a term.
CREATE TABLE IF NOT EXISTS course_offerings (
  id          SERIAL PRIMARY KEY,
  course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  term        TEXT NOT NULL,                -- e.g. "Fall 2026"
  semester    TEXT,
  section     TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- admin
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, section, term)
);
CREATE INDEX IF NOT EXISTS idx_offerings_teacher ON course_offerings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_offerings_course ON course_offerings(course_id);

-- Which students are enrolled in an offering (the expected set for "absent").
CREATE TABLE IF NOT EXISTS enrollments (
  id          SERIAL PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offering_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_offering ON enrollments(offering_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);

-- Weekly meeting times for an offering. teacher_id is denormalized from the
-- offering for fast "my classes" lookups. Admin sets duration + windows per slot.
CREATE TABLE IF NOT EXISTS timetable_slots (
  id                  SERIAL PRIMARY KEY,
  offering_id         INTEGER NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  teacher_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Mon..6=Sun
  start_time          TIME NOT NULL,
  duration_minutes    INTEGER NOT NULL DEFAULT 60,
  mark_window_minutes INTEGER NOT NULL DEFAULT 15,   -- student marking window W
  start_grace_minutes INTEGER NOT NULL DEFAULT 15,   -- teacher start grace G
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- admin
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_slots_teacher_day ON timetable_slots(teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_slots_offering ON timetable_slots(offering_id);

-- Escalation requests: teacher->admin (late start), student->teacher (late mark).
CREATE TABLE IF NOT EXISTS permission_requests (
  id           SERIAL PRIMARY KEY,
  type         TEXT NOT NULL CHECK (type IN ('teacher_late_start', 'student_late_mark')),
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id      INTEGER REFERENCES timetable_slots(id) ON DELETE SET NULL,
  session_id   INTEGER REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'used')),
  decided_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_perm_requester ON permission_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_perm_status ON permission_requests(status);

-- In-site inbox / notifications (admin escalations, empty-session notices, info).
CREATE TABLE IF NOT EXISTS messages (
  id           SERIAL PRIMARY KEY,
  to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'info',
  body         TEXT NOT NULL,
  ref_id       INTEGER,
  is_read      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id, is_read);

-- --- Idempotent column additions to existing v2 tables --------------------
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS slot_id INTEGER REFERENCES timetable_slots(id) ON DELETE SET NULL;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMPTZ;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS attendance_until TIMESTAMPTZ;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS teacher_status TEXT;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS offering_id INTEGER REFERENCES course_offerings(id) ON DELETE SET NULL;

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS attendee_role TEXT NOT NULL DEFAULT 'student';
-- Widen the status CHECK to allow 'late' and 'absent' on already-existing DBs.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('present', 'denied', 'late', 'absent'));
