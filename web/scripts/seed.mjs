// Seed realistic demo data so the deployed app can be tested end-to-end.
// Idempotent: re-running wipes prior seed data (keyed by @seed.attendnet emails
// and the seeded course codes) and rebuilds it. Real accounts are preserved.
//
//   node --env-file=.env.local scripts/seed.mjs
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (t, p) => pool.query(t, p);

const PASSWORD = 'Passw0rd!';
const SEED_DOMAIN = '@seed.attendnet';
const COURSE_CODES = ['CS-301', 'CS-302', 'CS-303', 'SE-310', 'CS-305'];
const TERM = 'Fall 2026';

// PKT helpers (UTC+5)
const PKT = 5 * 3600 * 1000;
const pktNow = () => new Date(Date.now() + PKT);
const pktDow = () => (pktNow().getUTCDay() + 6) % 7;
const hhmm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // --- wipe prior seed data ---------------------------------------------
  await q(`DELETE FROM courses WHERE code = ANY($1)`, [COURSE_CODES]); // cascades offerings/enrollments/slots
  await q(`DELETE FROM users WHERE email LIKE $1`, ['%' + SEED_DOMAIN]); // cascades their sessions/attendance
  console.log('• cleared previous seed data');

  // --- teachers ----------------------------------------------------------
  const teacherDefs = [
    ['Dr. Imran Khan', 'imran.khan' + SEED_DOMAIN, 'Information Security'],
    ['Dr. Sara Ahmed', 'sara.ahmed' + SEED_DOMAIN, 'Operating Systems'],
    ['Dr. Bilal Malik', 'bilal.malik' + SEED_DOMAIN, 'Database Systems'],
  ];
  const teachers = {};
  for (const [name, email, subject] of teacherDefs) {
    const r = await q(
      `INSERT INTO users (role,name,email,password_hash,status,subject) VALUES ('teacher',$1,$2,$3,'approved',$4) RETURNING id`,
      [name, email, hash, subject]
    );
    teachers[email] = r.rows[0].id;
  }
  console.log(`• ${Object.keys(teachers).length} teachers`);

  // --- students ----------------------------------------------------------
  const firstNames = ['Ali', 'Ayesha', 'Hamza', 'Fatima', 'Usman', 'Zainab', 'Hassan', 'Maryam', 'Bilal', 'Iqra'];
  const studentIds = [];
  for (let i = 0; i < firstNames.length; i++) {
    const name = `${firstNames[i]} ${['Raza', 'Khan', 'Sheikh', 'Butt', 'Awan'][i % 5]}`;
    const email = `student${i + 1}${SEED_DOMAIN}`;
    const roll = `FA22-BCS-${String(i + 1).padStart(3, '0')}`;
    const r = await q(
      `INSERT INTO users (role,name,email,password_hash,status,subject,semester,section,roll_no)
       VALUES ('student',$1,$2,$3,'approved','Computer Science','6','A',$4) RETURNING id`,
      [name, email, hash, roll]
    );
    studentIds.push(r.rows[0].id);
  }
  console.log(`• ${studentIds.length} students`);

  // Optionally include the real demo accounts so the owner can test with them.
  const realStudent = (await q(`SELECT id FROM users WHERE email='muzzamilh795@gmail.com'`)).rows[0]?.id;
  const realTeacher = (await q(`SELECT id FROM users WHERE email='ishratriaz92@gmail.com'`)).rows[0]?.id;
  if (realStudent) studentIds.push(realStudent);

  // --- courses -----------------------------------------------------------
  // Seeded students are all semester 6, so seed these courses into semester 6 so
  // they appear in the semester-filtered enroll UI for those students.
  const courseDefs = [
    ['CS-301', 'Information Security', 6, 3],
    ['CS-302', 'Operating Systems', 6, 3],
    ['CS-303', 'Database Systems', 6, 3],
    ['SE-310', 'Software Engineering', 6, 3],
    ['CS-305', 'Mobile Computing', 6, 3],
  ];
  const courses = {};
  for (const [code, title, sem, cr] of courseDefs) {
    const r = await q(`INSERT INTO courses (code,title,semester,credit_hours) VALUES ($1,$2,$3,$4) RETURNING id`, [code, title, sem, cr]);
    courses[code] = r.rows[0].id;
  }
  console.log(`• ${Object.keys(courses).length} courses`);

  // --- offerings (teacher teaches a course-section in a term) ------------
  const tIds = Object.values(teachers);
  const offeringDefs = [
    ['CS-301', tIds[0]],
    ['CS-302', tIds[1]],
    ['CS-303', tIds[2]],
    ['SE-310', tIds[0]],
    ['CS-305', realTeacher || tIds[1]], // assign the real teacher here if present
  ];
  const offerings = {};
  for (const [code, teacherId] of offeringDefs) {
    const r = await q(
      `INSERT INTO course_offerings (course_id,teacher_id,term,semester,section) VALUES ($1,$2,$3,'6','A') RETURNING id`,
      [courses[code], teacherId, TERM]
    );
    offerings[code] = r.rows[0].id;
  }
  console.log(`• ${Object.keys(offerings).length} offerings`);

  // --- enrollments: all students into every offering --------------------
  for (const offId of Object.values(offerings)) {
    for (const sid of studentIds) {
      await q(`INSERT INTO enrollments (offering_id,student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [offId, sid]);
    }
  }
  console.log(`• enrolled ${studentIds.length} students into ${Object.keys(offerings).length} offerings`);

  // --- timetable: a weekly grid + one class LIVE NOW --------------------
  const slot = (offCode, dow, time, teacherId) =>
    q(`INSERT INTO timetable_slots (offering_id,teacher_id,day_of_week,start_time,duration_minutes,mark_window_minutes,start_grace_minutes)
       VALUES ($1,$2,$3,$4,60,15,15)`, [offerings[offCode], teacherId, dow, time]);
  await slot('CS-301', 0, '09:00', tIds[0]);
  await slot('CS-301', 2, '09:00', tIds[0]);
  await slot('CS-302', 0, '11:00', tIds[1]);
  await slot('CS-302', 3, '11:00', tIds[1]);
  await slot('CS-303', 1, '09:00', tIds[2]);
  await slot('SE-310', 2, '13:00', tIds[0]);
  await slot('SE-310', 4, '13:00', tIds[0]);
  // LIVE NOW: today (PKT), starting a couple minutes ago so it's startable now.
  const liveStart = new Date(pktNow().getTime() - 2 * 60000);
  await slot('CS-305', pktDow(), hhmm(liveStart), offeringDefs[4][1]);
  console.log(`• timetable seeded incl. a CS-305 class live now (~${hhmm(liveStart)} PKT, taught by ${realTeacher ? 'your real teacher account' : 'Dr. Sara Ahmed'})`);

  // --- past sessions for CS-301 so attendance % has data ----------------
  const cs301 = offerings['CS-301'];
  const enrolled = (await q(`SELECT student_id FROM enrollments WHERE offering_id=$1`, [cs301])).rows.map((r) => r.student_id);
  let madeSessions = 0;
  for (let d = 6; d >= 1; d--) {
    const opened = new Date(Date.now() - d * 24 * 3600 * 1000);
    const sres = await q(
      `INSERT INTO attendance_sessions
        (teacher_id,subject,semester,section,network_ip,is_open,opened_at,closed_at,
         slot_id,offering_id,scheduled_start,attendance_until,ends_at,teacher_status)
       VALUES ($1,$2,'6','A','10.0.0.1',FALSE,$3,$3,NULL,$4,$3,$3,$3,'present') RETURNING id`,
      [tIds[0], 'CS-301 — Information Security', opened, cs301]
    );
    const sid = sres.rows[0].id;
    madeSessions++;
    enrolled.forEach((stuId, idx) => {
      // deterministic mix: ~80% present, some late, some absent
      const m = (idx + d) % 5;
      const st = m === 0 ? 'absent' : m === 1 ? 'late' : 'present';
      return q(
        `INSERT INTO attendance (session_id,student_id,status,attendee_role,ip_ok,ip_address)
         VALUES ($1,$2,$3,'student',$4,$5) ON CONFLICT DO NOTHING`,
        [sid, stuId, st, st !== 'absent', st === 'absent' ? null : '10.0.0.1']
      );
    });
  }
  console.log(`• ${madeSessions} past CS-301 sessions with attendance (varied present/late/absent)`);

  console.log('\n✅ Seed complete.');
  console.log(`   Login password for ALL seeded accounts: ${PASSWORD}`);
  console.log('   Teachers: imran.khan@seed.attendnet, sara.ahmed@seed.attendnet, bilal.malik@seed.attendnet');
  console.log('   Students: student1@seed.attendnet … student10@seed.attendnet');
}

main().catch((e) => { console.error('Seed failed:', e); process.exitCode = 1; }).finally(() => pool.end());
