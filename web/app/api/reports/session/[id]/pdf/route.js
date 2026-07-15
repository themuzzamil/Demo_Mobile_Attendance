import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchSessionReport } from '@/lib/reports';
import { buildTablePdf, fileHeaders, slug } from '@/lib/exportDoc';
import { SESSION_COLS, sessionTitle } from '@/lib/reportCols';

export const runtime = 'nodejs';

// PDF for one class meeting: who attended and who was absent, by name + roll ID.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchSessionReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const s = report.session;
  const pdf = await buildTablePdf({
    title: 'Class Register',
    subtitle: sessionTitle(report),
    cols: SESSION_COLS,
    rows: report.students,
  });
  await audit(request, user.id, 'report.session_pdf', { sessionId: s.id, rows: report.students.length });

  const day = new Date(s.opened_at).toISOString().slice(0, 10);
  return new NextResponse(pdf, {
    headers: fileHeaders('application/pdf', `${slug(s.code || s.subject, s.section, day)}_attendance.pdf`),
  });
}
