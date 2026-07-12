# Mobile Attendance System

Network-verified attendance for the Information Security course project. A student
is marked **present only when their public IP matches the teacher's** — i.e. they
are physically on the same classroom network. No GPS, no hardcoded IPs: the
teacher's network is detected live when they open an attendance session.

## Live demo
**URL:** https://demo-mobile-attendance.vercel.app

**Admin login** (sign in at `/login` with the **roll no / teacher ID or email** + password):

| Field    | Value                   |
|----------|-------------------------|
| Email    | `admin@attendnet.com`   |
| Password | `Admin@12345`           |

> ⚠️ These are demo credentials committed to a public repo. **Change the password
> after first login** before using the deployment for anything real. The admin
> creates every other account (teachers and students) from the **People** tab.

The database ships **empty except the admin**. Sign in as the admin, then use
**People → Add** to create teachers and students (each gets an auto login ID and a
password by email), add **Courses**, create **Offerings**, **Enroll** students, and
build the **Timetable** — the app walks that order.

## Components

| Folder | What it is | Stack |
|--------|------------|-------|
| `web/` | **API + admin/teacher/student dashboards (responsive, mobile-friendly)** | Next.js (App Router), Neon PostgreSQL |

## Quick start
```bash
cd web
npm install
npm run migrate -- --reset    # clean schema, no dummy data
npm run dev                   # http://localhost:3000
```
Then open `/signup` **once** to create the first administrator. After that,
self-signup is closed and the admin provisions everyone else. Full details:
[`web/README.md`](web/README.md).

## Roles & provisioning
Accounts are **created by an administrator**, not self-service. There is no public
sign-up beyond bootstrapping the first admin.

- **Admin** (name, email, password) — created once via `/signup` (bootstrap).
  Adds teachers and students, builds the catalog/timetable, resolves escalations.
- **Teacher** (name, email) — **added by admin**. Gets an auto **Teacher ID**
  (`0001`, `0002`, …). Starts/closes scheduled classes; approves late-mark requests.
- **Student** (name, email, semester, section) — **added by admin**. Gets an auto
  **roll number** (`00001`, `00002`, …), then is **enrolled** into that semester's
  offerings. Marks attendance.

**Credential flow:** when the admin adds a teacher/student, their **login ID**
(roll no / teacher ID) and a **password are auto-generated** and **emailed** to
them. They **sign in with that ID (or their email) + password**, then change the
password from their own dashboard (**Account** tab). If they lose it, they request a
fresh set at **`/request-access`** (which generates a **new** password — the old one
stops working), or the admin re-issues from the People tab. Credentials are also
shown to the admin as a fallback when email isn't configured.

Login is by **roll number / teacher ID (or email) + password**.

### Email configuration
Emails send via **SMTP** (e.g. a Gmail app password) if configured, else via
[Resend](https://resend.com). Set these env vars (local `.env.local` **and** Vercel):

| Var | Purpose |
|-----|---------|
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `465` (implicit TLS) or `587` (STARTTLS) |
| `SMTP_USER` | SMTP username, e.g. your Gmail address |
| `SMTP_PASS` | SMTP password / **Gmail app password** |
| `EMAIL_FROM` | From-address, e.g. `AttendNet <you@gmail.com>` (defaults to `SMTP_USER`) |
| `APP_BASE_URL` | Base URL for the sign-in link when the request origin is unavailable |
| `RESEND_API_KEY` | *(alternative to SMTP)* Resend API key |

If no provider is configured, the generated credentials are shown to the admin in
the dashboard to share manually — so the flow works without email too.

## Course model
- **Course** — catalog entry with a **code** (`CS-301`) and a **semester** (1–8),
  defined once.
- **Offering** — one **teacher** teaching a course to a **section** in a **term**
  (`CS-301 · Sec B · Fall 2026`). The offering **inherits the course's semester**.
  Students are **enrolled** here: the admin picks a student and only that student's
  **semester's** offerings are shown to enroll into (dropdown-driven, no free text).
- **Timetable slot** — when an offering meets. Admin just picks the offering; the
  teacher and the enrolled roster are attached automatically. Overlapping slots for
  the same teacher or section are **blocked**.
- A student belongs to **many offerings** and sees a **per-course attendance %**.

## How attendance works
1. **Admin** adds teachers and students, defines courses (each tagged to a
   semester), creates offerings (assigning a teacher), enrolls students into their
   semester's offerings, then builds the **weekly timetable** by choosing an
   offering + day + PKT time, with per-slot **lecture duration**, **marking window**
   and **teacher start grace** (minutes).
2. **Teacher** sees today's classes and **starts the class** at its scheduled time
   (this also marks the teacher present). Their live **public IP** is captured as
   the reference network. Starting after the grace period needs **admin permission**.
3. **Student** **marks present** within the marking window → their public IP is
   compared. **Same IP → present**, different → **denied**. After the window
   closes they must **request the teacher's permission**, which (once approved)
   lets them mark and counts as present.
4. At lecture end, enrolled non-markers are **auto-marked absent**. Teachers may
   end an **empty** session early (10+ min in) by writing a reason (audited).

A **"class starting soon" countdown** appears for both the teacher and enrolled
students in the last 3 minutes before a scheduled class. All window/timing checks
are enforced **server-side in UTC**. Every action is audited; the admin has full
oversight (logs, attendees, per-teacher headcounts). Full design in [`SPEC.md`](SPEC.md).

## Information Security features
- **Authentication** — JWT + bcrypt. Login by roll no / teacher ID (or email) +
  password. Admin-provisioned accounts get an auto-generated password (bcrypt-hashed);
  resets invalidate the old password. `/request-access` avoids account enumeration.
- **Authorization** — role-based access; accounts are **admin-provisioned** (no open
  sign-up beyond the first-admin bootstrap)
- **Fraud prevention** — network (public-IP) presence verification
- **Audit logging** — every sensitive action recorded with IP
- **Confidentiality** — role-scoped data (teachers see only their own offerings and sessions)
- **Reporting** — CSV + PDF

## Notes / limitations
- Students behind the same Wi-Fi share one public IP (NAT), so matching public IPs
  confirms "same network as the teacher". A VPN would change the public IP, so like
  any single signal it is not unspoofable — but it cleanly enforces class-network presence.
- `.env.local` holds real DB credentials and is git-ignored. Rotate the Neon
  password before sharing publicly.
