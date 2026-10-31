import { NextRequest, NextResponse } from 'next/server';
import { requireAccount } from '@/lib/auth/guards';
import { startRentPayment } from '@/lib/rentals/payments';

/** A tenant starts paying what's left on one month by bank; the answer is Stripe's payment page. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (gate.account.role !== 'tenant') return NextResponse.json({ message: 'Only the tenant can pay rent online.' }, { status: 403 });
  const result = await startRentPayment(gate.account, params.id, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ url: result.url });
}
