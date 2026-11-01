import type Stripe from 'stripe';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, licenseInvites, planPurchases, pricePlans } from '@/db/schema';
import { addMonths, todayEastern } from '@/lib/dates';
import { planPurchaseEmail, sendMail, smtpConfigured } from '@/lib/email/mail';
import { notify } from '@/lib/notify';
import { stripe } from '@/lib/stripe';
import { newInviteToken, tellAdmins } from './licenses';

/**
 * Selling Vrentals licenses online. Vachi staff set the prices on /platform. A buyer pays once on
 * Stripe's checkout page, on Vachi's own Stripe account, so the money lands in the bank account
 * linked there. When Stripe confirms the payment, a new buyer is emailed a one-time sign-up link
 * carrying the paid license, a signed-in buyer's license is extended, and staff are notified.
 */

type Plan = typeof pricePlans.$inferSelect;
type Purchase = typeof planPurchases.$inferSelect;

/** Online payment needs Stripe's key and the webhook secret for Vachi's own account. */
export function billingConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_BILLING_WEBHOOK_SECRET);
}

export const usd = (amount: string | number) => `$${Number(amount).toFixed(2).replace(/\.00$/, '')}`;

export function planTerm(months: number): string {
  if (months === 1) return 'month';
  if (months === 12) return 'year';
  return `${months} months`;
}

/** The new end date after paying for `months` more: counted from today, or from the current end date if that's later. */
export function extendedExpiry(current: string | null, months: number, today = todayEastern()): string {
  return addMonths(current && current > today ? current : today, months);
}

export const signupLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, '')}/signup?invite=${encodeURIComponent(token)}`;

type Fail = { ok: false; status: number; message: string };

/** Opens a Stripe checkout for one plan. `account` is set when a signed-in customer renews or upgrades. */
export async function startPlanCheckout(
  planId: string,
  buyer: { email: string; fullName: string | null },
  account: { id: string } | null,
  appUrl: string,
): Promise<{ ok: true; url: string } | Fail> {
  if (!billingConfigured()) return { ok: false, status: 503, message: "Online payment isn't turned on yet. Contact Vachi Services to buy a plan." };
  const [plan] = await db.select().from(pricePlans).where(and(eq(pricePlans.id, planId), eq(pricePlans.isActive, true))).limit(1);
  if (!plan) return { ok: false, status: 404, message: 'That plan is no longer offered. Pick another one.' };
  const [purchase] = await db
    .insert(planPurchases)
    .values({ planId: plan.id, planName: plan.name, email: buyer.email.toLowerCase(), fullName: buyer.fullName, amount: plan.price, accountId: account?.id ?? null })
    .returning();
  const base = appUrl.replace(/\/+$/, '');
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: purchase.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(Number(plan.price) * 100),
          product_data: { name: `Vrentals ${plan.name}`, description: `${plan.homeLimit === null ? 'Unlimited homes' : `Up to ${plan.homeLimit} ${plan.homeLimit === 1 ? 'home' : 'homes'}`} for ${plan.months === 1 ? '1 month' : `${plan.months} months`}` },
        },
      },
    ],
    metadata: { vrentals_purchase: purchase.id },
    success_url: `${base}/pricing/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing`,
  });
  await db.update(planPurchases).set({ stripeSessionId: session.id }).where(eq(planPurchases.id, purchase.id));
  if (!session.url) return { ok: false, status: 502, message: "Couldn't open the payment page. Try again in a minute." };
  return { ok: true, url: session.url };
}

/** Tells every Vachi staff member, in the app and (through notify) by email. */
export async function notifyAdmins(title: string, message: string, _appUrl: string, urgent = false): Promise<void> {
  await tellAdmins(title, message, urgent);
}

/**
 * Gives the buyer what they paid for. Safe to call more than once for the same session (Stripe
 * retries webhooks; the thank-you page may also check): only the first call changes anything.
 */
export async function fulfillPurchase(sessionId: string, appUrl: string): Promise<Purchase | null> {
  const [purchase] = await db
    .update(planPurchases)
    .set({ status: 'paid', paidAt: new Date() })
    .where(and(eq(planPurchases.stripeSessionId, sessionId), inArray(planPurchases.status, ['started', 'processing'])))
    .returning();
  if (!purchase) return null;
  const [plan] = purchase.planId ? await db.select().from(pricePlans).where(eq(pricePlans.id, purchase.planId)).limit(1) : [];
  const months = plan?.months ?? 1;
  const homeLimit = plan ? plan.homeLimit : null;
  const kind = plan?.kind === 'homeowner' ? 'homeowner' : 'landlord';

  // A buyer who already has an account (signed in, or paying with its email) gets it extended.
  const [account] = purchase.accountId
    ? await db.select().from(accounts).where(eq(accounts.id, purchase.accountId)).limit(1)
    : await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.email, purchase.email), eq(accounts.role, 'landlord'), isNull(accounts.actsFor)))
        .limit(1);
  let detail: string;
  if (account) {
    const planExpires = extendedExpiry(account.planExpires, months);
    await db.update(accounts).set({ homeLimit, planExpires, planPaid: true, updatedAt: new Date() }).where(eq(accounts.id, account.id));
    await db.update(planPurchases).set({ accountId: account.id }).where(eq(planPurchases.id, purchase.id));
    detail = `${account.email}'s license now runs through ${planExpires}.`;
    await notify({ accountId: account.id, title: 'Payment received', message: `Thank you. Your ${purchase.planName} plan now runs through ${planExpires}.`, link: '/account' });
  } else {
    const [invite] = await db
      .insert(licenseInvites)
      .values({ token: newInviteToken(), email: purchase.email, kind, homeLimit, planExpires: extendedExpiry(null, months), paid: true, note: `Paid online: ${purchase.planName}` })
      .returning();
    await db.update(planPurchases).set({ inviteId: invite.id }).where(eq(planPurchases.id, purchase.id));
    detail = `A sign-up link was ${smtpConfigured() ? 'emailed to them' : 'made (email is not set up, so send it from Licenses)'}.`;
    if (smtpConfigured()) await sendMail(purchase.email, planPurchaseEmail(purchase.fullName ?? '', purchase.planName, signupLink(appUrl, invite.token))).catch(() => undefined);
  }
  await notifyAdmins('New payment', `${purchase.fullName || purchase.email} (${purchase.email}) paid ${usd(purchase.amount)} for ${purchase.planName}. ${detail}`, appUrl);
  return purchase;
}

/** The sign-up link for a paid purchase, for the thank-you page. Null until Stripe confirms it. */
export async function purchaseForSession(sessionId: string) {
  const [row] = await db
    .select({ purchase: planPurchases, token: licenseInvites.token, usedAt: licenseInvites.usedAt })
    .from(planPurchases)
    .leftJoin(licenseInvites, eq(licenseInvites.id, planPurchases.inviteId))
    .where(eq(planPurchases.stripeSessionId, sessionId))
    .limit(1);
  return row ?? null;
}

/** Handles one verified event from Vachi's own Stripe account. Other events are ignored. */
export async function handleBillingEvent(event: Stripe.Event, appUrl: string): Promise<void> {
  if (!event.type.startsWith('checkout.session.')) return;
  const session = event.data.object as Stripe.Checkout.Session;
  if (!session.metadata?.vrentals_purchase) return;
  if (event.type === 'checkout.session.async_payment_succeeded' || (event.type === 'checkout.session.completed' && session.payment_status === 'paid')) {
    await fulfillPurchase(session.id, appUrl);
    return;
  }
  if (event.type === 'checkout.session.completed') {
    // A bank debit: started now, confirmed in a few business days.
    await db.update(planPurchases).set({ status: 'processing' }).where(and(eq(planPurchases.stripeSessionId, session.id), eq(planPurchases.status, 'started')));
    return;
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    const [purchase] = await db.update(planPurchases).set({ status: 'failed' }).where(eq(planPurchases.stripeSessionId, session.id)).returning();
    if (purchase) await notifyAdmins('Payment failed', `${purchase.email}'s bank payment of ${usd(purchase.amount)} for ${purchase.planName} didn't go through. No license was given.`, appUrl, true);
    return;
  }
  if (event.type === 'checkout.session.expired') {
    await db.update(planPurchases).set({ status: 'expired' }).where(and(eq(planPurchases.stripeSessionId, session.id), eq(planPurchases.status, 'started')));
  }
}
