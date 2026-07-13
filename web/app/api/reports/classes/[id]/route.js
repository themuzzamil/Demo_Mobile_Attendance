import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { fetchOfferingReport } from '@/lib/reports';

export const runtime = 'nodejs';

// GET: full attendance report for one offering (class) — enrolled roster with
// per-student totals + %, and the list of sessions held. Teacher sees only their
// own class; admin sees any. 404 when not found or not permitted.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchOfferingReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  return NextResponse.json(report);
}
