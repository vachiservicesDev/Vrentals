import { NextResponse } from 'next/server';
import { ownerIdOf, requireAccount } from '@/lib/auth/guards';
import { receiptFor } from '@/lib/rentals/receipt';

/** One month's rent receipt, for the home's landlord or the tenant on the lease. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const receipt = await receiptFor(gate.account, gate.account.role === 'landlord' ? ownerIdOf(gate.account) : null, params.id);
  if (!receipt) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json({ receipt });
}
