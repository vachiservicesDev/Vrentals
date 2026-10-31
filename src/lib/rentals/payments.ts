import type Stripe from 'stripe';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, rentCharges, rentPayments } from '@/db/schema';
import { todayEastern } from '@/lib/dates';
import { notify, notifyLandlords } from '@/lib/notify';
import { paymentsConfigured, stripe } from '@/lib/stripe';
import { balanceOf } from './messages';
import { chargeDetails, sendReceipt } from './receipt';
import { monthName, usdText } from './rent';

type Account = typeof accounts.$inferSelect;
type Fail = { ok: false; status: number; message: string };

const base = (appUrl: string) => appUrl.replace(/\/+$/, '');

/**
 * Sends the owner to Stripe to connect (or finish connecting) the account rent is paid into. Stripe
 * collects the business, bank and identity details on its own pages.
 */
export async function connectLink(owner: Account, appUrl: string): Promise<{ ok: true; url: string } | Fail> {
  if (!paymentsConfigured()) return { ok: false, status: 503, message: "Online payments aren't switched on for this app yet." };
  let accountId = owner.stripeAccountId;
  if (!accountId) {
    const created = await stripe().accounts.create({
      type: 'standard',
      email: owner.email,
      country: 'US',
      business_profile: { product_description: 'Residential rent collected through Vrentals', mcc: '6513' },
      metadata: { rentalsAccountId: owner.id },
    });
    accountId = created.id;
    await db.update(accounts).set({ stripeAccountId: accountId, updatedAt: new Date() }).where(eq(accounts.id, owner.id));
  }
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    refresh_url: `${base(appUrl)}/account?stripe=refresh#payments`,
    return_url: `${base(appUrl)}/account?stripe=return#payments`,
  });
  return { ok: true, url: link.url };
}

/** Asks Stripe whether the owner's account can take payments yet, and remembers the answer. */
export async function refreshConnect(owner: Account): Promise<boolean> {
  if (!owner.stripeAccountId || !paymentsConfigured()) return false;
  const acct = await stripe().accounts.retrieve(owner.stripeAccountId);
  const enabled = !!acct.charges_enabled;
  if (enabled !== owner.stripeChargesEnabled) await db.update(accounts).set({ stripeChargesEnabled: enabled, updatedAt: new Date() }).where(eq(accounts.id, owner.id));
  return enabled;
}

/** Whether tenants of this owner can pay online right now. */
export async function ownerTakesPayments(ownerId: string): Promise<{ accountId: string } | null> {
  if (!paymentsConfigured()) return null;
  const [owner] = await db.select({ id: accounts.stripeAccountId, enabled: accounts.stripeChargesEnabled }).from(accounts).where(eq(accounts.id, ownerId)).limit(1);
  return owner?.id && owner.enabled ? { accountId: owner.id } : null;
}

/** Payments still on their way for these months, so nobody pays twice. */
export async function pendingPayments(chargeIds: string[]) {
  if (chargeIds.length === 0) return [];
  return db
    .select({ chargeId: rentPayments.chargeId, amount: rentPayments.amount, status: rentPayments.status, createdAt: rentPayments.createdAt })
    .from(rentPayments)
    .where(and(inArray(rentPayments.chargeId, chargeIds), eq(rentPayments.status, 'processing')));
}

/**
 * Starts a tenant's bank payment of what's left on one month: a Stripe Checkout page on the
 * landlord's own Stripe account, where the tenant signs in to their bank (or enters it) on Stripe.
 */
export async function startRentPayment(tenant: Account, chargeId: string, appUrl: string): Promise<{ ok: true; url: string } | Fail> {
  const d = await chargeDetails(chargeId);
  if (!d || d.lease.tenantId !== tenant.id || d.lease.status !== 'active') return { ok: false, status: 404, message: 'Not found' };
  const owed = balanceOf(d.charge);
  if (owed <= 0) return { ok: false, status: 409, message: 'This month is already paid.' };
  const payee = await ownerTakesPayments(d.property.ownerId);
  if (!payee) return { ok: false, status: 409, message: "Your landlord hasn't set up online payments. Pay them the usual way." };
  if ((await pendingPayments([d.charge.id])).length) return { ok: false, status: 409, message: 'A bank payment for this month is already on its way. It takes a few business days.' };

  // A checkout already open for this month is reused, so the tenant can't end up paying twice.
  const [started] = await db
    .select()
    .from(rentPayments)
    .where(and(eq(rentPayments.chargeId, d.charge.id), eq(rentPayments.status, 'started')))
    .limit(1);
  if (started) {
    const open = started.stripeSessionId
      ? await stripe()
          .checkout.sessions.retrieve(started.stripeSessionId, { stripeAccount: started.stripeAccountId })
          .catch(() => null)
      : null;
    if (open?.status === 'open' && open.url && started.amount === owed.toFixed(2)) return { ok: true, url: open.url };
    if (open?.status === 'open') await stripe().checkout.sessions.expire(open.id, { stripeAccount: started.stripeAccountId });
    if (open?.status === 'complete') return { ok: false, status: 409, message: 'A bank payment for this month is already on its way. It takes a few business days.' };
    await db.update(rentPayments).set({ status: 'expired', updatedAt: new Date() }).where(and(eq(rentPayments.id, started.id), eq(rentPayments.status, 'started')));
  }

  // The unique index on active payments stops two clicks at once from both getting through.
  const [payment] = await db
    .insert(rentPayments)
    .values({ chargeId: d.charge.id, payerId: tenant.id, amount: owed.toFixed(2), stripeAccountId: payee.accountId })
    .onConflictDoNothing()
    .returning();
  if (!payment) return { ok: false, status: 409, message: 'A payment for this month is already being set up. Refresh the page and try again.' };
  const session = await stripe().checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['us_bank_account'],
      payment_method_options: { us_bank_account: { verification_method: 'automatic', financial_connections: { permissions: ['payment_method'] } } },
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'usd', unit_amount: Math.round(owed * 100), product_data: { name: `${monthName(d.charge.period)} rent`, description: d.property.name } },
        },
      ],
      customer_email: d.lease.tenantEmail,
      client_reference_id: payment.id,
      metadata: { rentPaymentId: payment.id, chargeId: d.charge.id },
      payment_intent_data: { metadata: { rentPaymentId: payment.id, chargeId: d.charge.id }, description: `${monthName(d.charge.period)} rent, ${d.property.name}` },
      success_url: `${base(appUrl)}/home?payment=sent`,
      cancel_url: `${base(appUrl)}/home?payment=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    { stripeAccount: payee.accountId, idempotencyKey: `rent-payment-${payment.id}` },
  );
  await db.update(rentPayments).set({ stripeSessionId: session.id, updatedAt: new Date() }).where(eq(rentPayments.id, payment.id));
  return { ok: true, url: session.url! };
}

async function paymentForSession(session: Stripe.Checkout.Session, accountId: string | undefined) {
  const id = session.metadata?.rentPaymentId;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [payment] = await db.select().from(rentPayments).where(eq(rentPayments.id, id)).limit(1);
  // The event must come from the same landlord account and checkout the payment was started on.
  if (!payment || payment.stripeAccountId !== accountId || (payment.stripeSessionId && payment.stripeSessionId !== session.id)) return null;
  return payment;
}

const intentId = (session: Stripe.Checkout.Session) => (typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null));

/** The money arrived: add it to the month (once, however often Stripe repeats the event) and send a receipt. */
async function settle(payment: typeof rentPayments.$inferSelect, session: Stripe.Checkout.Session, appUrl: string) {
  // One transaction: the payment is never marked done without the month being credited.
  const won = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(rentPayments)
      .set({ status: 'succeeded', stripePaymentIntentId: intentId(session), updatedAt: new Date() })
      .where(and(eq(rentPayments.id, payment.id), ne(rentPayments.status, 'succeeded')))
      .returning();
    if (!row) return false;
    await tx
      .update(rentCharges)
      .set({ paidAmount: sql`${rentCharges.paidAmount} + ${payment.amount}`, paidOn: todayEastern(), paymentMethod: 'bank_transfer', updatedAt: new Date() })
      .where(eq(rentCharges.id, payment.chargeId));
    return true;
  });
  if (!won) return;
  const d = await chargeDetails(payment.chargeId);
  if (!d) return;
  await sendReceipt(d, appUrl);
  await notifyLandlords(d.property.ownerId, {
    title: `Rent paid online: ${d.property.name}`,
    message: `${d.lease.tenantName} paid ${usdText(payment.amount)} toward ${monthName(d.charge.period)} rent by bank. Stripe sends it to your bank on its usual schedule.`,
    link: `/homes/${d.property.id}#rent`,
  });
}

/** Handles one verified Stripe event. Unknown events are ignored. */
export async function handleStripeEvent(event: Stripe.Event, appUrl: string): Promise<void> {
  if (event.type === 'account.updated') {
    const acct = event.data.object;
    await db.update(accounts).set({ stripeChargesEnabled: !!acct.charges_enabled, updatedAt: new Date() }).where(eq(accounts.stripeAccountId, acct.id));
    return;
  }
  if (!event.type.startsWith('checkout.session.')) return;
  const session = event.data.object as Stripe.Checkout.Session;
  const payment = await paymentForSession(session, event.account);
  if (!payment || payment.status === 'succeeded') return;

  if (event.type === 'checkout.session.async_payment_succeeded' || (event.type === 'checkout.session.completed' && session.payment_status === 'paid')) {
    return settle(payment, session, appUrl);
  }
  if (event.type === 'checkout.session.completed') {
    // A bank debit: started now, confirmed in a few business days.
    await db.update(rentPayments).set({ status: 'processing', stripePaymentIntentId: intentId(session), updatedAt: new Date() }).where(eq(rentPayments.id, payment.id));
    const d = await chargeDetails(payment.chargeId);
    if (d) {
      await notifyLandlords(d.property.ownerId, {
        title: `Bank payment started: ${d.property.name}`,
        message: `${d.lease.tenantName} started a ${usdText(payment.amount)} bank payment for ${monthName(d.charge.period)} rent. It's added to the month once the bank confirms it, usually in about 4 business days.`,
        link: `/homes/${d.property.id}#rent`,
      });
    }
    return;
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    await db.update(rentPayments).set({ status: 'failed', failureMessage: 'The bank declined the payment.', updatedAt: new Date() }).where(eq(rentPayments.id, payment.id));
    const d = await chargeDetails(payment.chargeId);
    if (!d) return;
    const message = `The ${usdText(payment.amount)} bank payment for ${monthName(d.charge.period)} rent at ${d.property.name} didn't go through. No money moved.`;
    if (payment.payerId) await notify({ accountId: payment.payerId, title: 'Rent payment failed', message: `${message} Please try again or pay another way.`, urgent: true, link: '/home' });
    await notifyLandlords(d.property.ownerId, { title: `Rent payment failed: ${d.property.name}`, message, urgent: true, link: `/homes/${d.property.id}#rent` });
    return;
  }
  if (event.type === 'checkout.session.expired') {
    await db.update(rentPayments).set({ status: 'expired', updatedAt: new Date() }).where(and(eq(rentPayments.id, payment.id), eq(rentPayments.status, 'started')));
  }
}
