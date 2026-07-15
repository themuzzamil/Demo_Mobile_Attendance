import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchOfferingReport } from '@/lib/reports';
import { buildCsv, fileHeaders, slug } from '@/lib/exportDoc';
import { ROSTER_COLS, rosterTitle } from '@/lib/reportCols';

export const runtime = 'nodejs';

// CSV of a class roster: every enrolled student with their totals + attendance %.
// Teacher -> own class only; admin -> any (enforced by fetchOfferingReport).
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchOfferingReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  const { offering } = report;
  const csv = buildCsv(ROSTER_COLS, report.roster, [rosterTitle(report)]);
  await audit(request, user.id, 'report.class_csv', {
    offeringId: offering.id, rows: report.roster.length,
  });

  return new NextResponse(csv, {
    headers: fileHeaders('text/csv', `${slug(offering.code, offering.section, offering.term)}_roster.csv`),
  });
}
