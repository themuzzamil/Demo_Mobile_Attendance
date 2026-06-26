import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request) {
  const { error, status } = requireRole(request, 'admin');
  if (error) return NextResponse.json({ error }, { status });
  const { rows } = await query(
    `SELECT al.*, u.name AS user_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 500`
  );
  return NextResponse.json({ logs: rows });
}
