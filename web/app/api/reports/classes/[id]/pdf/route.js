import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchOfferingReport } from '@/lib/reports';
import { buildTablePdf, fileHeaders, slug } from '@/lib/exportDoc';
import { ROSTER_COLS, rosterTitle } from '@/lib/reportCols';

export const runtime = 'nodejs';

// PDF of a class roster: every enrolled student with their totals + attendance %.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchOfferingReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const { offering } = report;
  const pdf = await buildTablePdf({
    title: 'Class Attendance Report',
    subtitle: rosterTitle(report),
    cols: ROSTER_COLS,
    rows: report.roster,
  });
  await audit(request, user.id, 'report.class_pdf', {
    offeringId: offering.id, rows: report.roster.length,
  });

  return new NextResponse(pdf, {
    headers: fileHeaders('application/pdf', `${slug(offering.code, offering.section, offering.term)}_roster.pdf`),
  });
}
