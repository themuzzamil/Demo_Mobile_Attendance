# Mobile Attendance System

Network-verified attendance for the Information Security course project. A student
is marked **present only when their public IP matches the teacher's** — i.e. they
are physically on the same classroom network. No GPS, no hardcoded IPs: the
teacher's network is detected live when they open an attendance session.

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
  students of their subject; opens/closes attendance sessions.
- **Student** (name, email, password, subject, semester, section, roll no) —
  approved by a teacher of their subject. Marks attendance.

Login is by **email + password** for all roles.

## How attendance works
1. Teacher **opens a session** → their live **public IP** is captured as the
   reference network.
2. Student **marks present** → their public IP is sent and compared.
3. **Same IP → present**, different → **denied**. Every attempt is recorded with
   the IP and written to the audit log; teachers/admins export CSV/PDF reports.

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
