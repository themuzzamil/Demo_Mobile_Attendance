import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fetchRecords } from '@/lib/reports';

export const runtime = 'nodejs';

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const rows = await fetchRecords(user, searchParams);
  await audit(request, user.id, 'report.csv', { count: rows.length });

  const headers = [
    'id', 'student_name', 'roll_no', 'semester', 'section', 'subject',
    'teacher_name', 'status', 'ip_address', 'ip_ok', 'reason', 'created_at',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','));

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="attendance.csv"',
    },
  });
}
