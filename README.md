# Mobile Attendance System

Network-verified attendance for the Information Security course project. A student
is marked **present only when their public IP matches the teacher's** — i.e. they
are physically on the same classroom network. No GPS, no hardcoded IPs: the
teacher's network is detected live when they open an attendance session.

## Live demo
**URL:** https://demo-mobile-attendance.vercel.app

**Admin login** (sign in at `/login`, login is by email + password):

| Field    | Value             |
|----------|-------------------|
| Email    | `admin@demo.com`  |
| Password | `Admin@12345`     |

> ⚠️ These are demo credentials committed to a public repo. **Change the password
> after first login** (or delete this account) before using the deployment for
> anything real. The admin can approve teachers; teachers approve students.

## Components

| Folder         | What it is                                  | Stack                    |
|----------------|---------------------------------------------|--------------------------|
| `web/`         | **API + admin/teacher/student dashboards**  | Next.js (App Router), Neon PostgreSQL |
| `flutter_app/` | Native student app *(pending update — see below)* | Flutter (Dart)     |

## Quick start
```bash
cd web
npm install
npm run migrate -- --reset    # clean schema, no dummy data
npm run dev                   # http://localhost:3000  →  go to /signup
```
Full details: [`web/README.md`](web/README.md).

## Roles & approval chain
- **Admin** (name, email, password) — self-approved. Approves teachers.
- **Teacher** (name, email, password, subject) — approved by admin. Approves
  students of their subject; starts/closes scheduled classes; approves student
  late-mark requests.
- **Student** (name, email, password, subject, semester, section, roll no) —
  approved by a teacher of their subject. Marks attendance.

Login is by **email + password** for all roles.

## How attendance works
1. **Admin** builds the **weekly timetable**: subject + teacher + section, with a
   scheduled start time, **lecture duration**, **marking window** and **teacher
   start grace** (minutes) per slot, and enrolls students into the class roster.
2. **Teacher** sees today's classes and **starts the class** at its scheduled time
   (this also marks the teacher present). Their live **public IP** is captured as
   the reference network. Starting after the grace period needs **admin permission**.
3. **Student** **marks present** within the marking window → their public IP is
   compared. **Same IP → present**, different → **denied**. After the window
   closes they must **request the teacher's permission**, which (once approved)
   lets them mark and counts as present.
4. At lecture end, enrolled non-markers are **auto-marked absent**. Teachers may
   end an **empty** session early (10+ min in) by **messaging the admin**.

All window/timing checks are enforced **server-side in UTC**. Every action is
audited; the admin has full oversight (logs, attendees, per-teacher headcounts).
Full design in [`SPEC.md`](SPEC.md).

## Information Security features
- **Authentication** — JWT + bcrypt, email/password
- **Authorization** — role-based access + an **approval workflow** (admin→teacher→student)
- **Fraud prevention** — network (public-IP) presence verification
- **Audit logging** — every sensitive action recorded with IP
- **Confidentiality** — role-scoped data (teachers see only their subject/sessions)
- **Reporting** — CSV + PDF

## Status of the Flutter app
The `flutter_app/` was written for the earlier GPS/class model and **has not yet
been updated** to the new email-auth + approval + IP-session model. Until then the
**`web/` student page (`/student`) is the working student client.** Updating
Flutter is tracked as a follow-up.

## Notes / limitations
- Students behind the same Wi-Fi share one public IP (NAT), so matching public IPs
  confirms "same network as the teacher". A VPN would change the public IP, so like
  any single signal it is not unspoofable — but it cleanly enforces class-network presence.
- `.env.local` holds real DB credentials and is git-ignored. Rotate the Neon
  password before sharing publicly.
