# Project Proposal

# MOBILE ATTENDANCE SYSTEM

**Course:** Information Security

**Department of Computer Science**

**BSCS 3 — Section B**

**Submitted To**
Mr. Yawar Abbas

**Submitted By**
Muzzamil Hussain
Rijja Sajjid

**Project Focus**
Network-verified (public-IP) attendance delivered as a responsive web application

---

## Table of Contents

1. Introduction
2. Problem Statement
3. Proposed Solution
4. Project Objectives
5. System Flow
6. User Roles and Permissions
7. Main Features
8. Information Security Features
9. Technology Stack
10. Expected Outcome
11. Conclusion

---

## 1. Introduction

Attendance management is essential in educational institutes and organizations. Traditional methods often lead to proxy attendance, inaccurate records, and weak oversight. This project proposes a Mobile Attendance System delivered as a **responsive web application** — usable directly in a phone or laptop browser with no app install. Instead of GPS or location tracking, it verifies that a student is physically on the **same classroom network** as the teacher by comparing public IP addresses. All timing and verification decisions are made on the server, so a client can never fake a result.

## 2. Problem Statement

Current attendance systems face several challenges:

- Proxy attendance and fake check-ins.
- Attendance marked from outside the classroom.
- Manual, error-prone record keeping.
- Weak access control and unmanaged accounts.
- Lack of auditability and reliable reporting.

## 3. Proposed Solution

A teacher starts a timetabled class; the server captures the teacher's **public IP** as the reference network. Students mark their presence within a time-boxed window, and the server records them **present only if their public IP matches the teacher's** — otherwise the attempt is denied. Accounts are **created by an administrator** (no open sign-up); each teacher and student receives an auto-generated login ID and password by email. Enrolled students who never mark are automatically swept to **absent** at lecture end, and every sensitive action is recorded in an audit log. No GPS, no native app, no hardcoded IPs.

## 4. Project Objectives

- Deliver a responsive, web-based attendance system usable on mobile browsers.
- Verify presence through server-side network (public-IP) matching.
- Enforce timetable-driven, time-boxed marking windows in UTC on the server.
- Provide admin-provisioned, role-based access with auto-generated credentials.
- Generate per-course attendance reports (CSV/PDF) and maintain audit logs.

## 5. System Flow

```
Admin provisions accounts, courses, offerings, enrolments and the timetable
                                  │
                                  ▼
        Teacher starts the scheduled class  →  server captures teacher public IP
                                  │
                                  ▼
        Student taps "Mark me present" within the marking window
                                  │
                                  ▼
              Student public IP == teacher public IP ?
                        │ Yes                    │ No
                        ▼                        ▼
                    Present                    Denied
                                  │
                                  ▼
        Lecture ends → enrolled non-markers auto-marked Absent
                                  │
                                  ▼
                    Every action written to Audit Log
```

## 6. User Roles and Permissions

| Role | Permissions |
| --- | --- |
| Admin | Provisions teachers and students; defines courses, offerings, enrolments and the weekly timetable; approves teacher late-start requests; full oversight, logs and reports. |
| Teacher | Starts and closes scheduled classes (which records the teacher present); approves student late-mark requests; views roster and records; exports CSV/PDF. |
| Student | Marks presence on the class network within the window; requests permission if late; views own per-course attendance percentage. |

## 7. Main Features

| Feature | Description |
| --- | --- |
| Admin-provisioned accounts | Teachers and students are added by the admin; login ID and password are auto-generated and emailed. |
| Network (IP) verification | A student is present only when their public IP matches the teacher's captured network. |
| Timetable-driven sessions | Scheduled classes with per-slot lecture duration, teacher start grace and student marking window. |
| Escalation workflow | Single-use permissions: student → teacher (late mark), teacher → admin (late start). |
| Class-starting countdown | A live 3-minute heads-up before class for both teacher and enrolled students. |
| Attendance and reports | Per-course attendance percentage with CSV and PDF export. |
| Audit logging | Every sensitive action is recorded with the originating IP. |

## 8. Information Security Features

| Security Concept | Implementation |
| --- | --- |
| Authentication | JWT sessions with bcrypt password hashing; login by roll no / teacher ID or email. |
| Authorization | Role-based access control; accounts are admin-provisioned (no open sign-up). |
| Credential handling | Passwords are auto-generated and bcrypt-hashed; a reset invalidates the old password. |
| Confidentiality | Role-scoped data (teachers see only their own offerings and sessions). |
| Integrity | Server-authoritative time windows in UTC; clients cannot decide a window. |
| Audit logging | Continuous activity tracking with IP for accountability. |
| Fraud prevention | Public-IP network verification and single-use escalation permissions. |

## 9. Technology Stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js (App Router) + React (responsive) |
| Backend / API | Next.js Route Handlers (Node.js) |
| Database | PostgreSQL (Neon) |
| Authentication | JWT + bcrypt |
| Email | SMTP via Nodemailer (or Resend) |
| Presence signal | Public-IP comparison |
| Reports | CSV + PDF (PDFKit) |
| Hosting | Vercel |

## 10. Expected Outcome

The system provides a secure, reliable, install-free attendance solution that ensures attendance can only be marked from the classroom network and within scheduled windows. It improves attendance accuracy, reduces proxy attendance, and strengthens security through authentication, authorization, network verification, and full auditability.

## 11. Conclusion

The Mobile Attendance System combines network-based presence verification with essential Information Security concepts — authentication, authorization, role-based access control, audit logging, and fraud prevention. Delivered as a responsive web application, it offers a practical, secure, and scalable solution for attendance management in educational institutes and organizations.
