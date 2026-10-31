import { NextRequest, NextResponse } from 'next/server';
import { requireLandlord, requireOwner } from '@/lib/auth/guards';
import { connectLink, refreshConnect } from '@/lib/rentals/payments';
import { paymentsConfigured } from '@/lib/stripe';

/** Where the owner's online payments stand: switched on for the app, connected, able to take payments. */
export async function GET() {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const enabled = await refreshConnect(gate.owner).catch(() => gate.owner.stripeChargesEnabled);
  return NextResponse.json({ configured: paymentsConfigured(), connected: !!gate.owner.stripeAccountId, enabled, isOwner: !gate.account.actsFor });
}

/** The owner starts (or continues) connecting their Stripe account. */
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const result = await connectLink(gate.account, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ url: result.url });
}
