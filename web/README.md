# Mobile Attendance — Next.js app (API + dashboards)

A single **Next.js (App Router)** app: REST API + role dashboards, backed by Neon
PostgreSQL. Attendance is verified by **network IP** — a student is marked present
only if their public IP matches the teacher's (i.e. they are on the same network).

## Run

```bash
cd web
npm install
# .env.local already has DATABASE_URL (Neon) + JWT_SECRET
npm run migrate -- --reset   # build a clean schema (drops existing data)
npm run dev                  # http://localhost:3000
```

There is **no seed data** — create the first account from the UI.

## Accounts & approval workflow

Sign up at `/signup` (role tabs):

| Role    | Signup fields                                        | Approval                          |
|---------|------------------------------------------------------|-----------------------------------|
| Admin   | name, email, password                                | auto-approved                     |
| Teacher | name, email, password, **subject**                   | approved by an **admin**          |
| Student | name, email, password, **subject, semester, section, roll no** | approved by a **teacher** of the same subject |

Everyone logs in with **email + password**. Unapproved users can log in but see a
"pending approval" screen until approved.

Typical first run: sign up an **admin** → admin approves teachers → teachers
approve students of their subject.

## How the IP check works
1. A **teacher opens an attendance session**. The browser detects the teacher's
   real **public IP** (via an external lookup) and the server stores it as the
   session's reference network (also logging the server-seen IP for audit).
2. A **student taps "Mark me present"**. The browser detects the student's public
   IP and sends it.
3. The server compares the two public IPs. **Equal → present**, else **denied**
   ("not on the same network"). One record per student per session.

> Because students behind the same Wi-Fi/router share one public IP (NAT),
> matching public IPs confirms "same network as the teacher". Client-reported IPs
> are used so this works in dev and production alike; the server-seen IP is also
> stored for cross-checking. (Like any single signal it is not unspoofable — a VPN
> would change the public IP — but it cleanly enforces "present on the class network".)

## Pages
- `/login`, `/signup`
- `/admin` — approve teachers, view all users, stats
- `/teacher` — open/close session (shows captured IP + live present count), approve
  students of your subject, view records, export CSV/PDF
- `/student` — mark present against the open session, view history

## API (all under `/api`)
- `auth/signup`, `auth/login`, `auth/me`
- `users` (list), `users/pending`, `users/:id/approve`, `users/:id/reject`, `users/:id` (DELETE)
- `sessions/open`, `sessions/:id/close`, `sessions/active`, `sessions` (list)
- `attendance/check-in`, `attendance/me`, `attendance` (records)
- `reports/attendance/csv`, `reports/attendance/pdf`, `reports/audit`

## Deploy (Vercel)
Set root to `web/`, add `DATABASE_URL` + `JWT_SECRET`. API routes run as serverless
functions; `x-forwarded-for` carries the real client IP, used as a fallback when a
client cannot report its own public IP.
