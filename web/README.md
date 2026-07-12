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

The database ships **empty except the admin** — create everything else from the UI.

## Accounts & provisioning

There is **no public sign-up**. `/signup` only creates the **first admin** (it 403s
once an admin exists); everyone else is **provisioned by the admin**.

| Role    | Admin enters        | Auto-generated                         |
|---------|---------------------|----------------------------------------|
| Admin   | name, email, password (bootstrap once) | —                       |
| Teacher | name, email         | **Teacher ID** (`0001…`) + password     |
| Student | name, email, semester, section | **roll number** (`00001…`) + password |

When the admin adds a teacher/student, their **login ID + password are emailed**
(see email env vars in the root README). They sign in with **roll no / teacher ID
(or email) + password**, and change it from the **Account** tab. Lost credentials:
`/request-access` emails a fresh password, or the admin re-issues from **People**.

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
- `/login`, `/signup` (first-admin bootstrap), `/request-access` (get/reset credentials)
- `/admin` — People (add/manage users), Courses, Offerings, Enroll, Timetable,
  Requests, Overview/stats
- `/teacher` — Today's classes (start/close, "starting soon" countdown), Requests,
  Records (CSV/PDF), Account
- `/student` — Mark attendance (network-verified, "starting soon" countdown),
  My attendance %, Schedule, History, Account

## API (all under `/api`)
- `auth/login`, `auth/signup` (bootstrap), `auth/me`, `auth/request-access`, `auth/change-password`
- `users` (list + provision), `users/:id` (enrollments / DELETE), `users/:id/invite` (issue credentials)
- `courses`, `offerings`, `offerings/:id/enroll`, `timetable` (+ `today`, `my`)
- `sessions/open`, `sessions/:id/close`, `sessions/active`, `sessions` (list)
- `attendance/check-in`, `attendance/me`, `attendance/my-summary`, `attendance` (records)
- `permissions` (+ `:id`), `reports/attendance/csv`, `reports/attendance/pdf`, `reports/audit`

## Deploy (Vercel)
Set root to `web/`, add `DATABASE_URL` + `JWT_SECRET`. API routes run as serverless
functions; `x-forwarded-for` carries the real client IP, used as a fallback when a
client cannot report its own public IP.
