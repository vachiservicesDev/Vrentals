import { NextRequest, NextResponse } from 'next/server';
import { handleStripeEvent } from '@/lib/rentals/payments';
import { webhookEvent } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/**
 * Stripe's events for connected landlord accounts (a Connect webhook). Each one is checked against
 * STRIPE_WEBHOOK_SECRET before anything is read from it.
 */
export async function POST(request: NextRequest) {
  let event;
  try {
    event = webhookEvent(await request.text(), request.headers.get('stripe-signature'));
  } catch {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 400 });
  }
  await handleStripeEvent(event, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  return NextResponse.json({ received: true });
}
