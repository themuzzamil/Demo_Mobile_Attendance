# Mobile Attendance System — Specification (v3)

Network-verified, timetable-driven attendance with manual class start, time-boxed
marking windows, and an escalation/permission workflow. This document is the
source of truth for the build.

> Status legend in this doc: 🟢 built · 🟡 in progress · ⚪ planned

---

## 1. Roles & responsibilities

| Role | Core job | Key actions |
|------|----------|-------------|
| **Admin** | Set up structure, resolve escalations, oversee everything | **Add teachers & students** (they receive a set-password link by email); define **courses** (each tagged to a semester 1–8) and **offerings**; **enroll** students into their semester's offerings; build weekly **timetable** (offering, day, start time, **lecture duration**, **marking window**, **grace**); approve **teacher late-start** requests; read **all** logs/reports; receive in-site **messages**. |
| **Teacher** | Run the lecture, be present, gatekeep late students | **Start class** at scheduled time (= own attendance); approve **student late-mark** requests; **end an empty session** (optional, after 10 min, *by writing a message to admin*); view own roster/history. |
| **Student** | Mark presence on the class network within the window | **Mark present** (public-IP verified); **request teacher permission** if late; view own attendance %. |

> **Number of admins:** not locked to one for now (to be decided later). The
> system is designed so all teacher escalations and notices route to admin(s).

### Account provisioning (no self-signup)
Accounts are **created by an admin**, not self-registered.

1. The first admin is created **once** via `/signup` (the route 403s once any admin
   exists).
2. Admin adds a teacher/student (`POST /api/users`) with just name/email (+ semester
   & section for students). The account is created `approved`; a **login id and
   password are auto-generated**:
   - **roll number** for students — 5 digits, `00001`, `00002`, …
   - **teacher id** for teachers — 4 digits, `0001`, `0002`, …
   The id lives in `users.roll_no` (globally unique) and is allocated by digit-width.
3. The credentials (login id + password) are **emailed** to the user. Login accepts
   the **roll no / teacher id OR the email** + password.
4. The user changes their password from their dashboard **Account** tab
   (`POST /api/auth/change-password`). If they lose it, `/request-access` emails a
   **fresh** password (the old one stops working; responds generically to avoid
   **account enumeration**); the admin can also re-issue from **People**.
5. Passwords are stored **bcrypt-hashed**; the plaintext exists only in the one
   email. If email isn't configured, the generated credentials are returned to the
   trusted admin in the dashboard to share manually.

---

## 2. Core concepts & timeline

Each timetable slot defines a lecture. When a teacher starts it, an
`attendance_session` is created.

```
T0 = scheduled start (from timetable)
D  = lecture duration (admin-set, e.g. 60 min)
G  = teacher start grace (e.g. 15 min)
W  = student marking window (e.g. 15 min)

T0 ───────────── T0+G ───────────────────────────── T0+D
│                 │                                    │
│ teacher starts  │ teacher must request ADMIN         │ lecture ends
│ normally        │ permission to start (one-time)     │ (auto-close + absent sweep)
│
│   teacher starts at S (actual)
│   S ─────────── S+W ──────────────────────────────
│   │              │
│   student marks  │ student must request TEACHER permission (one-time) → present
│   normally (IP)  │
```

**Timetable times are entered in Pakistan time (PKT = UTC+5, no DST)** and
resolved to absolute UTC instants on the server. **All time comparisons are
server-side**, so clients never decide whether a window is open.

---

## 3. Rules (authoritative)

### Lecture duration & windows
- Admin sets per slot: `duration_minutes`, `mark_window_minutes` (student window
  `W`), `start_grace_minutes` (teacher grace `G`). Sensible defaults: 60 / 15 / 15.

### Teacher start
- Teacher may **Start class** from `T0` up to `T0 + G`.
- Starting = teacher's **own attendance** recorded as `present`.
- After `T0 + G` with no session, **Start class is locked** → teacher must
  **request permission from an admin**. On approval (single-use), teacher can
  start; their attendance is recorded as `late`.

### Student marking
- Student may **Mark present** from `S` to `S + W`. Presence requires the
  **public IP to match** the teacher's captured network IP (unchanged from today).
- After `S + W`, marking is **locked (403)** → student must **request permission
  from the teacher**. On approval (single-use), the student can mark and is
  recorded as **`present`** (teacher approval makes them fully present).

### Empty session
- If a session has **0 present** and `now ≥ S + 10 min`, the teacher **may**
  (optional) end it early. Ending an empty session **requires the teacher to
  write a message to admin** (a reason). The end is audited and the message is
  delivered to admin(s).

### Lecture end / auto-absent
- At `T0 + D` a session **auto-closes**. Every **enrolled** student who is not
  `present`/`late` is recorded **`absent`** (the auto-absent sweep). This is why
  an explicit **roster** is required — "absent" needs a known expected set.

### Escalation ladder
```
Student ──request──► Teacher ──request──► Admin
```
Each granted request is **single-use** (status `used` after it's consumed), so an
approval can't be reused for another lecture/day.

---

## 4. Data model

Existing tables (`users`, `attendance_sessions`, `attendance`, `audit_logs`) are
extended; new tables added. All migrations are idempotent.

### users (extended)
Roles `admin|teacher|student`, `status`, profile fields. `password_hash` is now
**nullable** (NULL = admin-provisioned, invite pending). Students carry `semester`
(1–8), `section`, `roll_no`; `subject` is no longer collected for new accounts.

### auth_tokens (deprecated)
Introduced for the earlier emailed set-password **link** flow, now replaced by the
emailed-credentials flow. The table may still exist in migrated DBs but is unused.

### courses (extended)
```
+ semester SMALLINT   -- 1..8; the semester this course belongs to
```
Offerings inherit the course's semester; the enroll UI filters offerings by the
selected student's semester.

### classes (new) — a teachable unit (roster anchor)
```
id, subject, semester, section, teacher_id, created_by(admin), active
UNIQUE(subject, semester, section)
```

### enrollments (new) — which students belong to a class
```
id, class_id → classes, student_id → users, created_at
UNIQUE(class_id, student_id)
```

### timetable_slots (new) — the weekly schedule
```
id, class_id → classes, teacher_id → users,
day_of_week (0=Mon … 6=Sun), start_time (TIME),
duration_minutes, mark_window_minutes, start_grace_minutes,
created_by(admin), active
```

### attendance_sessions (extended)
```
+ slot_id → timetable_slots
+ scheduled_start TIMESTAMPTZ   -- resolved T0 for this occurrence
+ attendance_until TIMESTAMPTZ  -- S + W (student window close)
+ ends_at TIMESTAMPTZ           -- T0 + D (auto-close / sweep time)
+ teacher_status TEXT           -- 'present' | 'late'
+ ended_reason TEXT             -- set when ended early (empty session)
(existing: teacher_id, subject, semester, section, network_ip, is_open, opened_at, closed_at)
```

### attendance (extended)
```
+ attendee_role TEXT            -- 'student' | 'teacher'
status now allows: 'present' | 'denied' | 'late' | 'absent'
(existing: session_id, student_id, ip_address, ip_ok, reason, UNIQUE(session_id, student_id))
```

### permission_requests (new) — escalations
```
id, type ('teacher_late_start' | 'student_late_mark'),
requester_id → users, slot_id → timetable_slots, session_id → attendance_sessions(nullable),
status ('pending' | 'approved' | 'rejected' | 'used'),
decided_by → users, reason, created_at, decided_at
```
- `teacher_late_start` → approver = admin (no session yet, references slot).
- `student_late_mark` → approver = the session's teacher.

### messages (new) — in-site inbox / notifications
```
id, to_user_id → users, from_user_id → users,
kind ('teacher_late_start' | 'student_late_mark' | 'session_ended_empty' | 'info'),
body, ref_id (links to permission_requests/session), is_read, created_at
```

### audit_logs (existing)
Every sensitive action recorded with IP. Admin can read/filter all of it.

---

## 5. API surface (planned)

| Method & path | Role | Purpose |
|---|---|---|
| `POST /api/auth/signup` | public | Bootstrap the **first admin** only (403 afterwards) |
| `POST /api/users` | admin | **Provision** a teacher/student (no password) + email set-password link |
| `POST /api/users/[id]/invite` | admin | Re-issue a user's credentials (new password, emailed) |
| `GET /api/users/[id]` | admin | A student's enrolled offering ids (for the enroll UI) |
| `POST /api/auth/request-access` | public | Email me fresh credentials (enumeration-safe) |
| `POST /api/auth/change-password` | any | Change your own password (current + new) |
| `POST /api/classes` · `GET /api/classes` | admin | Create/list classes |
| `POST /api/classes/[id]/enroll` · `DELETE …/enroll` | admin/teacher | Manage roster |
| `POST /api/timetable` · `GET /api/timetable` · `DELETE …` | admin | Manage weekly slots |
| `GET /api/timetable/today` | teacher | Today's slots + start eligibility |
| `POST /api/sessions/open` (extended) | teacher | Start class from a slot (grace-gated, self-attendance) |
| `POST /api/sessions/[id]/close` (extended) | teacher | Close; `?empty=1` requires admin message |
| `POST /api/attendance/check-in` (extended) | student | Mark present, server-side window cutoff |
| `POST /api/permissions` | teacher/student | Raise late-start / late-mark request |
| `GET /api/permissions` | admin/teacher | List requests to act on |
| `POST /api/permissions/[id]/approve` · `/reject` | admin/teacher | Decide (single-use) |
| `GET /api/messages` · `POST /api/messages/[id]/read` | all | Inbox |
| `GET /api/admin/overview` | admin | Logs, attendees, per-teacher headcounts, % |

---

## 6. Security & integrity notes
- **Server clock authority** for all windows (UTC).
- **Public-IP match** is one signal (spoofable via VPN/hotspot). Roadmap: rotating
  QR/PIN second factor for stronger presence proof.
- Passwords **bcrypt-hashed**; auto-generated at provisioning and on reset; a reset
  **invalidates the old password**; `/request-access` is **enumeration-safe**.
- **Single-use** permissions prevent replay.
- **Audit everything**; admin-only oversight is role-scoped.
- Rotate the Neon DB password and the Vercel token used during initial deploy.

---

## 7. Build order
1. ⚪ Schema: classes, enrollments, timetable_slots, permission_requests, messages + session/attendance columns.
2. ⚪ Admin: timetable CRUD + roster.
3. ⚪ Teacher: scheduled start + self-attendance + grace lock.
4. ⚪ Student: server-side marking cutoff.
5. ⚪ Permission flows (teacher→admin, student→teacher), single-use.
6. ⚪ Messages + empty-session end (with admin message) + admin oversight.
7. ⚪ Auto-absent sweep + UI wiring + deploy.

Later / to decide: number of admins, QR/PIN second factor, push/email
notifications, password change/reset, httpOnly cookie sessions.
