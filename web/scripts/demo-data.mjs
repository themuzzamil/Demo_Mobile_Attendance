// Demo data WITHOUT a timetable (build that yourself in the dashboard).
// Adds teachers, students, courses across two semesters (3 & 6), offerings, and
// semester-correct enrollments. Idempotent: re-running wipes prior @demo.edu
// accounts and the demo course codes, then rebuilds. Real/other accounts kept.
//
//   node --env-file=.env.local scripts/demo-data.mjs
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (t, p) => pool.query(t, p);

const DEMO_DOMAIN = '@demo.edu';
const TEACHER_PW = 'Teacher@123';
const STUDENT_PW = 'Student@123';
const TERM = 'Fall 2026';
const DEMO_COURSE_CODES = ['CS-201', 'CS-202', 'MT-201', 'CS-305', 'SE-320'];

async function main() {
  const tHash = await bcrypt.hash(TEACHER_PW, 10);
  const sHash = await bcrypt.hash(STUDENT_PW, 10);

  // --- wipe prior demo data ---------------------------------------------
  await q(`DELETE FROM courses WHERE code = ANY($1)`, [DEMO_COURSE_CODES]); // cascades offerings/enrollments/slots
  await q(`DELETE FROM users WHERE email LIKE $1`, ['%' + DEMO_DOMAIN]);     // cascades their sessions/attendance
  console.log('• cleared previous demo data');

  // --- teachers ----------------------------------------------------------
  const teacherDefs = [
    ['Dr. Ahsan Ali', 'ahsan' + DEMO_DOMAIN],
    ['Dr. Nadia Farooq', 'nadia' + DEMO_DOMAIN],
  ];
  const teachers = {};
  for (const [name, email] of teacherDefs) {
    const r = await q(
      `INSERT INTO users (role,name,email,password_hash,status) VALUES ('teacher',$1,$2,$3,'approved') RETURNING id`,
      [name, email, tHash]
    );
    teachers[email] = r.rows[0].id;
  }
  console.log(`• ${Object.keys(teachers).length} teachers`);

  // --- students (semester 3 and semester 6) ------------------------------
  const studentDefs = [
    // [name, email, semester, section, roll_no]
    ['Ali Raza', 'ali' + DEMO_DOMAIN, 3, 'A', 'BSCS-F23-001'],
    ['Sara Khan', 'sara' + DEMO_DOMAIN, 3, 'A', 'BSCS-F23-002'],
    ['Bilal Ahmed', 'bilal' + DEMO_DOMAIN, 3, 'A', 'BSCS-F23-003'],
    ['Hina Malik', 'hina' + DEMO_DOMAIN, 6, 'A', 'BSCS-F21-010'],
    ['Usman Tariq', 'usman' + DEMO_DOMAIN, 6, 'A', 'BSCS-F21-011'],
    ['Ayesha Noor', 'ayesha' + DEMO_DOMAIN, 6, 'A', 'BSCS-F21-012'],
  ];
  const studentsBySem = { 3: [], 6: [] };
  for (const [name, email, sem, sec, roll] of studentDefs) {
    const r = await q(
      `INSERT INTO users (role,name,email,password_hash,status,semester,section,roll_no)
       VALUES ('student',$1,$2,$3,'approved',$4,$5,$6) RETURNING id`,
      [name, email, sHash, String(sem), sec, roll]
    );
    studentsBySem[sem].push(r.rows[0].id);
  }
  console.log(`• ${studentDefs.length} students (3 in sem 3, 3 in sem 6)`);

  // --- courses (two semesters) -------------------------------------------
  const courseDefs = [
    ['CS-201', 'Data Structures', 3, 3],
    ['CS-202', 'Object-Oriented Programming', 3, 3],
    ['MT-201', 'Discrete Mathematics', 3, 3],
    ['CS-305', 'Computer Networks', 6, 3],
    ['SE-320', 'Software Engineering', 6, 3],
  ];
  const courses = {};
  for (const [code, title, sem, cr] of courseDefs) {
    const r = await q(
      `INSERT INTO courses (code,title,semester,credit_hours) VALUES ($1,$2,$3,$4) RETURNING id`,
      [code, title, sem, cr]
    );
    courses[code] = { id: r.rows[0].id, semester: sem };
  }
  // Backfill semester on any pre-existing courses that have none, so the enroll
  // filter has something to show for them too.
  await q(`UPDATE courses SET semester = 6 WHERE semester IS NULL`);
  console.log(`• ${courseDefs.length} demo courses (+ backfilled semester on legacy courses)`);

  // --- offerings (assign a teacher to each course, section A, this term) --
  const tIds = Object.values(teachers);
  const offerings = {}; // code -> { id, semester }
  let ti = 0;
  for (const [code, meta] of Object.entries(courses)) {
    const teacherId = tIds[ti % tIds.length]; ti++;
    const r = await q(
      `INSERT INTO course_offerings (course_id,teacher_id,term,semester,section)
       VALUES ($1,$2,$3,$4,'A') RETURNING id`,
      [meta.id, teacherId, TERM, String(meta.semester)]
    );
    offerings[code] = { id: r.rows[0].id, semester: meta.semester };
  }
  console.log(`• ${Object.keys(offerings).length} offerings`);

  // --- enrollments: students into their OWN semester's offerings ---------
  let enrolled = 0;
  for (const { id: offId, semester } of Object.values(offerings)) {
    for (const sid of studentsBySem[semester] || []) {
      const r = await q(
        `INSERT INTO enrollments (offering_id,student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [offId, sid]
      );
      enrolled += r.rowCount;
    }
  }
  console.log(`• ${enrolled} enrollments (semester-matched)`);

  console.log('\n✅ Demo data ready (no timetable — add it yourself).');
  console.log(`   Teachers (pw ${TEACHER_PW}): ahsan@demo.edu, nadia@demo.edu`);
  console.log(`   Students (pw ${STUDENT_PW}): ali@demo.edu, sara@demo.edu, bilal@demo.edu (sem 3);`);
  console.log(`                                 hina@demo.edu, usman@demo.edu, ayesha@demo.edu (sem 6)`);
}

main().catch((e) => { console.error('Demo data failed:', e); process.exitCode = 1; }).finally(() => pool.end());
