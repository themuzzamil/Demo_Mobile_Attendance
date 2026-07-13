import { NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { fetchClassList } from '@/lib/reports';

export const runtime = 'nodejs';

// GET: classes (offerings) the caller may report on.
//   teacher -> only their own; admin -> all.
export async function GET(request) {
  const { user, error, status } = requireApproved(request, 'admin', 'teacher');
  if (error) return NextResponse.json({ error }, { status });

  const classes = await fetchClassList(user);
  return NextResponse.json({ classes });
}
