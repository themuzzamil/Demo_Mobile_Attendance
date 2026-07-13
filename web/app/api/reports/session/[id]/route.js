import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { fetchSessionReport } from '@/lib/reports';

export const runtime = 'nodejs';

// GET: one class meeting (session) — every enrolled student with their status
// (present / late / absent / pending / denied / not_marked) and roll ID. Teacher
// sees only their own session; admin sees any.
export async function GET(request, { params }) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const report = await fetchSessionReport(user, Number(params.id));
  if (!report) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(report);
}
