import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, licenseInvites, notifications, planPurchases, platformAdmins, pricePlans } from '@/db/schema';
import { POST as createPrice } from '@/app/api/platform/prices/route';
import { POST as checkout } from '@/app/api/billing/checkout/route';
import { GET as listPayments } from '@/app/api/platform/payments/route';
import { accountFor } from '@/lib/auth/guards';
import { extendedExpiry, handleBillingEvent } from '@/lib/rentals/billing';
import { resetDb, seedAccount } from './db';
import { jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

const stripeApi = vi.hoisted(() => ({ checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } } }));
vi.mock('@/lib/stripe', () => ({ paymentsConfigured: () => true, stripe: () => stripeApi, webhookEvent: vi.fn() }));
const mail = vi.hoisted(() => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/mail', async (orig) => ({ ...(await orig<typeof import('@/lib/email/mail')>()), smtpConfigured: () => true, sendMail: mail.sendMail }));

const json = (res: Response) => res.json() as Promise<any>;
const paidEvent = (id: string, purchaseId: string) => ({ type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', metadata: { vrentals_purchase: purchaseId } } } }) as any;

async function setupPlan() {
  const admin = await seedAccount({ email: 'ravi@vachi.example' });
  await db.insert(platformAdmins).values({ accountId: admin.id });
  setCurrentUser(admin.id);
  const res = await createPrice(jsonRequest({ name: 'Landlord Basic', kind: 'landlord', homeLimit: '5', months: '12', price: '199' }));
  expect(res.status).toBe(201);
  setCurrentUser(null);
  return { admin, plan: (await json(res)).plan };
}

describe('online payment for plans', () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = 'whsec_x';
  });

  it('a new buyer pays, gets a paid sign-up link by email, and staff are notified once', async () => {
    const { admin, plan } = await setupPlan();
    stripeApi.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_new', url: 'https://checkout.stripe.com/c/cs_new' });
    const res = await checkout(jsonRequest({ planId: plan.id, email: 'Buyer@Example.com', fullName: 'Bea Buyer' }));
    expect(await json(res)).toEqual({ url: 'https://checkout.stripe.com/c/cs_new' });
    const [args] = stripeApi.checkout.sessions.create.mock.calls[0];
    expect(args.line_items[0].price_data.unit_amount).toBe(19900);
    const [purchase] = await db.select().from(planPurchases);
    expect(purchase).toMatchObject({ email: 'buyer@example.com', status: 'started', stripeSessionId: 'cs_new' });

    await handleBillingEvent(paidEvent('cs_new', purchase.id), 'https://vrentals.test');
    await handleBillingEvent(paidEvent('cs_new', purchase.id), 'https://vrentals.test'); // Stripe retries
    const [invite] = await db.select().from(licenseInvites);
    expect(invite).toMatchObject({ email: 'buyer@example.com', homeLimit: 5, paid: true });
    expect(mail.sendMail).toHaveBeenCalledWith('buyer@example.com', expect.objectContaining({ text: expect.stringContaining(`/signup?invite=${invite.token}`) }));
    expect(await db.select().from(notifications).where(eq(notifications.accountId, admin.id))).toHaveLength(1);

    const account = await accountFor({ id: '8f6f2a8e-6f0a-4f43-8e1e-1d8f7b9c1d01', email: 'buyer@example.com', user_metadata: { signup_role: 'landlord', license_invite: invite.token } });
    expect(account).toMatchObject({ planPaid: true, homeLimit: 5 });

    setCurrentUser(admin.id);
    expect((await json(await listPayments())).payments[0]).toMatchObject({ status: 'paid', amount: '199.00' });
  });

  it('a signed-in owner renewing gets their own license extended', async () => {
    const { plan } = await setupPlan();
    const owner = await seedAccount({ email: 'owner@example.com' });
    await db.update(accounts).set({ planExpires: '2099-01-15', homeLimit: 2 }).where(eq(accounts.id, owner.id));
    setCurrentUser(owner.id);
    stripeApi.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_renew', url: 'https://checkout.stripe.com/c/cs_renew' });
    expect((await checkout(jsonRequest({ planId: plan.id }))).status).toBe(200);
    const [purchase] = await db.select().from(planPurchases);
    expect(purchase.accountId).toBe(owner.id);
    await handleBillingEvent(paidEvent('cs_renew', purchase.id), 'https://vrentals.test');
    const [after] = await db.select().from(accounts).where(eq(accounts.id, owner.id));
    expect(after).toMatchObject({ planExpires: '2100-01-15', homeLimit: 5, planPaid: true });
    expect(await db.select().from(licenseInvites)).toHaveLength(0);
  });

  it('refuses hidden plans and says so when payment is not set up', async () => {
    const { plan } = await setupPlan();
    await db.update(pricePlans).set({ isActive: false }).where(eq(pricePlans.id, plan.id));
    expect((await checkout(jsonRequest({ planId: plan.id, email: 'a@example.com', fullName: 'A' }))).status).toBe(404);
    delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    expect((await checkout(jsonRequest({ planId: plan.id, email: 'a@example.com', fullName: 'A' }))).status).toBe(503);
  });

  it('extends from the later of today and the current end date', () => {
    expect(extendedExpiry(null, 12, '2026-11-01')).toBe('2027-11-01');
    expect(extendedExpiry('2026-01-01', 1, '2026-11-01')).toBe('2026-12-01');
    expect(extendedExpiry('2027-03-31', 1, '2026-11-01')).toBe('2027-04-30');
  });
});
