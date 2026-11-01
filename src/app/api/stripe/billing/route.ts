import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { handleBillingEvent } from '@/lib/rentals/billing';

export const dynamic = 'force-dynamic';

/**
 * Stripe's events for Vachi's own account: payments for Vrentals plans. This is a separate webhook
 * from /api/stripe/webhook (landlords' rent), with its own secret, STRIPE_BILLING_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');
  let event;
  try {
    if (!secret || !signature) throw new Error('missing');
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ message: 'Invalid signature' }, { status: 400 });
  }
  await handleBillingEvent(event, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  return NextResponse.json({ received: true });
}
