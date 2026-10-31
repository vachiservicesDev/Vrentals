import Stripe from 'stripe';

/**
 * Stripe, for tenants' online rent. Off until STRIPE_SECRET_KEY is set (a Vercel "Sensitive"
 * variable, never in code or chat). Each landlord connects their own Stripe account, and rent is
 * charged on that account, so it lands in their bank and Stripe's fee comes out of it.
 * Tenants type their bank details on Stripe's page only; this app sees Stripe ids, never accounts.
 */
let client: Stripe | null = null;

export function paymentsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia', appInfo: { name: 'Vrentals' } });
  return client;
}

/** Checks a webhook's signature and returns its event; throws when it isn't really from Stripe. */
export function webhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) throw new Error('Missing webhook secret or signature');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
