// Generate a clean Proposal.pdf from structured content using PDFKit.
//   node scripts/gen-proposal.mjs     (run from web/)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', '..', 'Proposal.pdf');

const INK = '#0f172a';
const MUTED = '#475569';
const ACCENT = '#4f46e5';
const LINE = '#e2e8f0';
const HEAD_BG = '#eef2ff';

const doc = new PDFDocument({ size: 'A4', margins: { top: 60, bottom: 64, left: 60, right: 60 }, bufferPages: true });
doc.pipe(fs.createWriteStream(OUT));

const L = doc.page.margins.left;
const R = doc.page.width - doc.page.margins.right;
const W = R - L;
const bottom = () => doc.page.height - doc.page.margins.bottom;

function ensure(h) {
  if (doc.y + h > bottom()) doc.addPage();
}

// ---- Title block --------------------------------------------------------
function titleBlock() {
  doc.rect(L, doc.y, W, 4).fill(ACCENT);
  doc.moveDown(1);
  doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('Project Proposal', L, doc.y, { align: 'center' });
  doc.moveDown(0.4);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(26).text('MOBILE ATTENDANCE SYSTEM', { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor(ACCENT).font('Helvetica').fontSize(11)
    .text('Network-verified (public-IP) attendance — responsive web application', { align: 'center' });
  doc.moveDown(1.2);

  const meta = [
    ['Course', 'Information Security'],
    ['Department', 'Computer Science'],
    ['Class', 'BSCS 3 — Section B'],
    ['Submitted To', 'Mr. Yawar Abbas'],
    ['Submitted By', 'Muzzamil Hussain,  Rijja Sajjid'],
  ];
  const labelW = 110;
  for (const [k, v] of meta) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(MUTED).text(k, L + 40, y, { width: labelW });
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(v, L + 40 + labelW, y, { width: W - 40 - labelW });
    doc.moveDown(0.35);
  }
  doc.moveDown(0.8);
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor(LINE).stroke();
  doc.moveDown(1);
}

// ---- Block renderers ----------------------------------------------------
function heading(text) {
  ensure(40);
  doc.moveDown(0.6);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(14).text(text, L, doc.y);
  doc.moveTo(L, doc.y + 2).lineTo(R, doc.y + 2).strokeColor(LINE).stroke();
  doc.moveDown(0.5);
}

function paragraph(text) {
  doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(text, L, doc.y, { align: 'justify', lineGap: 2 });
  doc.moveDown(0.6);
}

function bullets(items) {
  doc.font('Helvetica').fontSize(10.5).fillColor(INK);
  for (const it of items) {
    ensure(20);
    const y = doc.y;
    doc.fillColor(ACCENT).text('•', L + 4, y, { width: 12 });
    doc.fillColor(INK).text(it, L + 20, y, { width: W - 20, lineGap: 1.5 });
    doc.moveDown(0.25);
  }
  doc.moveDown(0.5);
}

function table(columns, rows) {
  const pad = 7;
  const widths = columns.map((c) => c.width);
  const drawHeader = (y) => {
    const h = 22;
    doc.rect(L, y, W, h).fill(HEAD_BG);
    let x = L;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT);
    columns.forEach((c, i) => { doc.text(c.header, x + pad, y + 6, { width: widths[i] - 2 * pad }); x += widths[i]; });
    return y + h;
  };
  ensure(60);
  let y = drawHeader(doc.y);
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  for (const row of rows) {
    const heights = row.map((cell, i) => doc.heightOfString(cell, { width: widths[i] - 2 * pad, lineGap: 1.5 }));
    const rowH = Math.max(20, ...heights) + 10;
    if (y + rowH > bottom()) { doc.addPage(); y = drawHeader(doc.page.margins.top); doc.font('Helvetica').fontSize(9.5).fillColor(INK); }
    let x = L;
    row.forEach((cell, i) => {
      doc.fillColor(i === 0 ? INK : MUTED).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .text(cell, x + pad, y + 5, { width: widths[i] - 2 * pad, lineGap: 1.5 });
      x += widths[i];
    });
    y += rowH;
    doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
  }
  doc.y = y + 8;
}

function flow(lines) {
  const pad = 10;
  doc.font('Courier').fontSize(8.5);
  const h = lines.length * 11 + 2 * pad;
  ensure(h + 10);
  const y = doc.y;
  doc.rect(L, y, W, h).fillAndStroke('#f8fafc', LINE);
  doc.fillColor(INK);
  lines.forEach((ln, i) => doc.text(ln, L + pad, y + pad + i * 11, { width: W - 2 * pad, lineBreak: false }));
  doc.y = y + h + 8;
}

// ---- Content ------------------------------------------------------------
titleBlock();

heading('1. Introduction');
paragraph('Attendance management is essential in educational institutes and organizations. Traditional methods often lead to proxy attendance, inaccurate records, and weak oversight. This project proposes a Mobile Attendance System delivered as a responsive web application — usable directly in a phone or laptop browser with no app install. Instead of GPS or location tracking, it verifies that a student is physically on the same classroom network as the teacher by comparing public IP addresses. All timing and verification decisions are made on the server, so a client can never fake a result.');

heading('2. Problem Statement');
bullets([
  'Proxy attendance and fake check-ins.',
  'Attendance marked from outside the classroom.',
  'Manual, error-prone record keeping.',
  'Weak access control and unmanaged accounts.',
  'Lack of auditability and reliable reporting.',
]);

heading('3. Proposed Solution');
paragraph('A teacher starts a timetabled class; the server captures the teacher’s public IP as the reference network. Students mark their presence within a time-boxed window, and the server records them present only if their public IP matches the teacher’s — otherwise the attempt is denied. Accounts are created by an administrator (no open sign-up); each teacher and student receives an auto-generated login ID and password by email. Enrolled students who never mark are automatically swept to absent at lecture end, and every sensitive action is recorded in an audit log. No GPS, no native app, no hardcoded IPs.');

heading('4. Project Objectives');
bullets([
  'Deliver a responsive, web-based attendance system usable on mobile browsers.',
  'Verify presence through server-side network (public-IP) matching.',
  'Enforce timetable-driven, time-boxed marking windows in UTC on the server.',
  'Provide admin-provisioned, role-based access with auto-generated credentials.',
  'Generate per-course attendance reports (CSV/PDF) and maintain audit logs.',
]);

heading('5. System Flow');
flow([
  'Admin provisions accounts, courses, offerings, enrolments and timetable',
  '                     |',
  '                     v',
  'Teacher starts the scheduled class  ->  server captures teacher public IP',
  '                     |',
  '                     v',
  'Student taps "Mark me present" within the marking window',
  '                     |',
  '                     v',
  '        Student public IP == teacher public IP ?',
  '            | Yes                        | No',
  '            v                            v',
  '         PRESENT                       DENIED',
  '                     |',
  '                     v',
  'Lecture ends -> enrolled non-markers auto-marked ABSENT',
  '                     |',
  '                     v',
  '        Every action written to the Audit Log',
]);

heading('6. User Roles and Permissions');
table(
  [{ header: 'Role', width: 95 }, { header: 'Permissions', width: W - 95 }],
  [
    ['Admin', 'Provisions teachers and students; defines courses, offerings, enrolments and the weekly timetable; approves teacher late-start requests; full oversight, logs and reports.'],
    ['Teacher', 'Starts and closes scheduled classes (which records the teacher present); approves student late-mark requests; views roster and records; exports CSV/PDF.'],
    ['Student', 'Marks presence on the class network within the window; requests permission if late; views own per-course attendance percentage.'],
  ]
);

heading('7. Main Features');
table(
  [{ header: 'Feature', width: 165 }, { header: 'Description', width: W - 165 }],
  [
    ['Admin-provisioned accounts', 'Teachers and students are added by the admin; login ID and password are auto-generated and emailed.'],
    ['Network (IP) verification', "A student is present only when their public IP matches the teacher's captured network."],
    ['Timetable-driven sessions', 'Scheduled classes with per-slot lecture duration, teacher start grace and student marking window.'],
    ['Escalation workflow', 'Single-use permissions: student to teacher (late mark), teacher to admin (late start).'],
    ['Class-starting countdown', 'A live 3-minute heads-up before class for both teacher and enrolled students.'],
    ['Attendance and reports', 'Per-course attendance percentage with CSV and PDF export.'],
    ['Audit logging', 'Every sensitive action is recorded with the originating IP.'],
  ]
);

heading('8. Information Security Features');
table(
  [{ header: 'Security Concept', width: 150 }, { header: 'Implementation', width: W - 150 }],
  [
    ['Authentication', 'JWT sessions with bcrypt password hashing; login by roll no / teacher ID or email.'],
    ['Authorization', 'Role-based access control; accounts are admin-provisioned (no open sign-up).'],
    ['Credential handling', 'Passwords are auto-generated and bcrypt-hashed; a reset invalidates the old password.'],
    ['Confidentiality', 'Role-scoped data (teachers see only their own offerings and sessions).'],
    ['Integrity', 'Server-authoritative time windows in UTC; clients cannot decide a window.'],
    ['Audit logging', 'Continuous activity tracking with IP for accountability.'],
    ['Fraud prevention', 'Public-IP network verification and single-use escalation permissions.'],
  ]
);

heading('9. Technology Stack');
table(
  [{ header: 'Layer', width: 165 }, { header: 'Technology', width: W - 165 }],
  [
    ['Web application', 'Next.js (App Router) + React (responsive)'],
    ['Backend / API', 'Next.js Route Handlers (Node.js)'],
    ['Database', 'PostgreSQL (Neon)'],
    ['Authentication', 'JWT + bcrypt'],
    ['Email', 'SMTP via Nodemailer (or Resend)'],
    ['Presence signal', 'Public-IP comparison'],
    ['Reports', 'CSV + PDF (PDFKit)'],
    ['Hosting', 'Vercel'],
  ]
);

heading('10. Expected Outcome');
paragraph('The system provides a secure, reliable, install-free attendance solution that ensures attendance can only be marked from the classroom network and within scheduled windows. It improves attendance accuracy, reduces proxy attendance, and strengthens security through authentication, authorization, network verification, and full auditability.');

heading('11. Conclusion');
paragraph('The Mobile Attendance System combines network-based presence verification with essential Information Security concepts — authentication, authorization, role-based access control, audit logging, and fraud prevention. Delivered as a responsive web application, it offers a practical, secure, and scalable solution for attendance management in educational institutes and organizations.');

// ---- Footer page numbers -----------------------------------------------
// Writing in the bottom-margin band would make text() auto-paginate, so we zero
// the bottom margin on each page before stamping the footer.
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(range.start + i);
  doc.page.margins.bottom = 0;
  const fy = doc.page.height - 44;
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text('Mobile Attendance System — Project Proposal', L, fy, { width: W / 2, align: 'left', lineBreak: false })
    .text(`Page ${i + 1} of ${range.count}`, L + W / 2, fy, { width: W / 2, align: 'right', lineBreak: false });
}

doc.end();
console.log('✓ Proposal.pdf generated at', OUT);
