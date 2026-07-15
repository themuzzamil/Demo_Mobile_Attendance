import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchSessionReport } from '@/lib/reports';
import { buildCsv, fileHeaders, slug } from '@/lib/exportDoc';
import { SESSION_COLS, sessionTitle } from '@/lib/reportCols';

export const runtime = 'nodejs';

// CSV for one class meeting: who attended and who was absent, by name + roll ID.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchSessionReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const s = report.session;
  const csv = buildCsv(SESSION_COLS, report.students, [sessionTitle(report)]);
  await audit(request, user.id, 'report.session_csv', { sessionId: s.id, rows: report.students.length });

  const day = new Date(s.opened_at).toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: fileHeaders('text/csv', `${slug(s.code || s.subject, s.section, day)}_attendance.csv`),
  });
}
