import { setApproval } from '@/lib/approvals';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  return setApproval(request, params.id, 'rejected');
}
