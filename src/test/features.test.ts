import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, documents, notifications, platformAdmins, rentCharges, rentPayments } from '@/db/schema';
import { POST as createHome } from '@/app/api/properties/route';
import { GET as getHome } from '@/app/api/properties/[id]/route';
import { POST as createLease } from '@/app/api/properties/[id]/leases/route';
import { POST as generateRent } from '@/app/api/charges/generate/route';
import { PATCH as recordPayment } from '@/app/api/charges/[id]/route';
import { POST as payRoute } from '@/app/api/charges/[id]/pay/route';
import { GET as getReceipt } from '@/app/api/receipts/[id]/route';
import { GET as listTeam, POST as addTeam } from '@/app/api/team/route';
import { DELETE as removeTeam } from '@/app/api/team/[id]/route';
import { POST as inviteTenantRoute } from '@/app/api/leases/[id]/invite/route';
import { GET as listDocs, POST as saveDoc } from '@/app/api/properties/[id]/documents/route';
import { POST as uploadTicket } from '@/app/api/properties/[id]/documents/upload/route';
import { DELETE as deleteDoc, GET as openDoc } from '@/app/api/documents/[id]/route';
import { GET as platformList } from '@/app/api/platform/landlords/route';
import { PATCH as platformEdit } from '@/app/api/platform/landlords/[id]/route';
import { GET as cron } from '@/app/api/cron/rent-reminders/route';
import { GET as me } from '@/app/api/me/route';
import { receiptNumber, receiptText, reminderText, smsLink } from '@/lib/rentals/messages';
import { runRentReminders } from '@/lib/rentals/autoReminders';
import { handleStripeEvent } from '@/lib/rentals/payments';
import { resetDb, seedAccount } from './db';
import { getRequest, jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

const authAdmin = vi.hoisted(() => ({ generateLink: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: authAdmin } }) }));

const storage = vi.hoisted(() => ({
  createUploadUrl: vi.fn(async (path: string) => ({ path, token: 'upload-token' })),
  storedFile: vi.fn(async () => ({ size: 2048 })),
  downloadUrl: vi.fn(async () => 'https://storage.example/signed'),
  removeFile: vi.fn(async () => undefined),
}));
vi.mock('@/lib/storage', () => storage);

const stripeApi = vi.hoisted(() => ({ checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } }, accounts: { retrieve: vi.fn(), create: vi.fn() }, accountLinks: { create: vi.fn() } }));
vi.mock('@/lib/stripe', () => ({ paymentsConfigured: () => true, stripe: () => stripeApi, webhookEvent: vi.fn() }));

const params = (id: string) => ({ params: { id } });
const patch = (body: unknown) => new NextRequest('http://localhost/test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async <T = any>(res: Response): Promise<T> => res.json() as Promise<T>;
const del = () => new Request('http://localhost', { method: 'DELETE' });

async function setup() {
  await resetDb();
  const owner = await seedAccount({ role: 'landlord', email: 'ravi@example.com', fullName: 'Ravi Peddyreddy' });
  setCurrentUser(owner.id);
  const home = (await json(await createHome(jsonRequest({ name: 'Unit 12', address: '12 Wooster Heights Rd', city: 'Danbury', zip: '06810' })))).property;
  const tenant = await seedAccount({ role: 'tenant', email: 'jamie@example.com', fullName: 'Jamie Lee' });
  const lease = (
    await json(await createLease(jsonRequest({ tenantName: 'Jamie Lee', tenantEmail: 'jamie@example.com', tenantPhone: '(203) 555-0101', startDate: '2026-01-01', monthlyRent: '2400', dueDay: 1 }), params(home.id)))
  ).lease;
  // Linked the way an accepted invite links it.
  await db.execute(`update rentals.leases set tenant_id = '${tenant.id}' where id = '${lease.id}'` as never);
  return { owner, home, tenant, lease };
}

describe('messages', () => {
  const facts = { tenantName: 'Jamie Lee', landlordName: 'Ravi Peddyreddy', home: 'Unit 12', period: '2026-11-01', amount: '2400', paidAmount: '1400' };

  it('writes a receipt with the balance, and a reminder that knows when rent is late', () => {
    const text = receiptText({ ...facts, paidOn: '2026-11-02', paymentMethod: 'zelle' }, 'https://x/receipts/1');
    expect(text).toContain('received $1,400.00 for November 2026 rent at Unit 12 on Nov 2, 2026 by Zelle');
    expect(text).toContain('Balance still due for November 2026: $1,000.00.');
    expect(text).toContain('- Ravi');
    expect(receiptText({ ...facts, paidAmount: '2400', paidOn: null, paymentMethod: null })).toContain('paid in full');

    expect(reminderText({ ...facts, paidAmount: '0', dueDate: '2026-11-01', late: false })).toContain('friendly reminder that November 2026 rent for Unit 12 ($2,400.00) is due Nov 1, 2026');
    expect(reminderText({ ...facts, dueDate: '2026-11-01', late: true })).toContain("($1,000.00) was due Nov 1, 2026 and hasn't been received");
  });

  it('builds a text-message link and a short receipt number', () => {
    expect(smsLink('(203) 555-0101', 'Hi & thanks')).toBe('sms:2035550101?&body=Hi%20%26%20thanks');
    expect(receiptNumber('abcdef12-0000-0000-0000-000000000000', '2026-11-01')).toBe('R-202611-ABCDEF');
  });
});

describe('rent receipts', () => {
  it('sends the tenant a receipt when a payment is recorded, viewable by both sides only', async () => {
    const { owner, tenant } = await setup();
    await generateRent(jsonRequest({ month: '2026-11' }));
    const [charge] = await db.select().from(rentCharges);

    expect((await getReceipt(getRequest(), params(charge.id))).status).toBe(404); // nothing paid yet
    const res = await recordPayment(patch({ paidAmount: 2400, paidOn: '2026-11-01', paymentMethod: 'zelle' }), params(charge.id));
    expect(res.status).toBe(200);
    expect((await json(res)).receipt).toEqual({ emailed: false });

    const [note] = await db.select().from(notifications).where(eq(notifications.accountId, tenant.id));
    expect(note.title).toBe('Rent received for November 2026');
    expect(note.link).toBe(`/receipts/${charge.id}`);
    expect(note.message).toContain('November 2026 is paid in full');

    const mine = (await json(await getReceipt(getRequest(), params(charge.id)))).receipt;
    expect(mine).toMatchObject({ paid: '2400.00', balance: '0.00', landlord: { name: 'Ravi Peddyreddy' } });
    setCurrentUser(tenant.id);
    expect((await getReceipt(getRequest(), params(charge.id))).status).toBe(200);
    setCurrentUser((await seedAccount({ role: 'tenant' })).id);
    expect((await getReceipt(getRequest(), params(charge.id))).status).toBe(404);
    setCurrentUser((await seedAccount({ role: 'landlord' })).id);
    expect((await getReceipt(getRequest(), params(charge.id))).status).toBe(404);
    setCurrentUser(owner.id);
  });
});

describe('automatic rent reminders', () => {
  it('adds upcoming rent, reminds once 3 days ahead, and sends one late notice', async () => {
    const { owner, tenant } = await setup();
    const run1 = await runRentReminders('2026-11-27', 'https://app');
    expect(run1).toMatchObject({ added: 1, reminded: 0 }); // Dec 1 is 4 days out: added, not yet reminded
    const run2 = await runRentReminders('2026-11-28', 'https://app');
    expect(run2).toMatchObject({ added: 0, reminded: 1 });
    expect((await runRentReminders('2026-11-29', 'https://app')).reminded).toBe(0); // only once

    const tenantNotes = await db.select().from(notifications).where(eq(notifications.accountId, tenant.id));
    expect(tenantNotes.map((n) => n.title)).toEqual(['December 2026 rent is due soon']);

    // Grace (9 days) ends Dec 10; on Dec 11 it's late.
    expect((await runRentReminders('2026-12-11', 'https://app')).lateNotices).toBe(1);
    expect((await runRentReminders('2026-12-12', 'https://app')).lateNotices).toBe(0);
    const ownerNotes = await db.select().from(notifications).where(eq(notifications.accountId, owner.id));
    expect(ownerNotes.map((n) => n.title)).toContain('Rent is late at Unit 12');
  });

  it('only runs for Vercel Cron with the secret', async () => {
    process.env.CRON_SECRET = 'cron-secret-value';
    expect((await cron(new NextRequest('http://localhost/api/cron/rent-reminders'))).status).toBe(404);
    expect((await cron(new NextRequest('http://localhost/api/cron/rent-reminders', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(404);
    expect((await cron(new NextRequest('http://localhost/api/cron/rent-reminders', { headers: { authorization: 'Bearer cron-secret-value' } }))).status).toBe(200);
  });
});

describe('co-landlords', () => {
  it('lets the owner add a co-landlord who then manages the same homes', async () => {
    const { owner, home } = await setup();
    const wifeId = '7d1c0f9e-2b5a-4c8e-9f3d-1a2b3c4d5e6f';
    authAdmin.generateLink.mockResolvedValueOnce({ data: { user: { id: wifeId }, properties: { hashed_token: 'tok' } }, error: null });
    const res = await addTeam(jsonRequest({ fullName: 'Priya Peddyreddy', email: 'Priya@Example.com', mode: 'link' }));
    expect(res.status).toBe(201);
    expect((await json(res)).link).toContain('token_hash=tok');

    setCurrentUser(wifeId);
    expect((await getHome(getRequest(), params(home.id))).status).toBe(200);
    expect((await createHome(jsonRequest({ name: 'Unit 14', address: '14 Wooster Heights Rd' }))).status).toBe(201);
    const team = await json(await listTeam());
    expect(team).toMatchObject({ isOwner: false, owner: { id: owner.id } });
    // Only the owner manages the team.
    expect((await addTeam(jsonRequest({ fullName: 'X', email: 'x@example.com' }))).status).toBe(403);

    setCurrentUser(owner.id);
    expect((await removeTeam(del(), params(wifeId))).status).toBe(200);
    setCurrentUser(wifeId);
    expect((await getHome(getRequest(), params(home.id))).status).toBe(403); // no Rentals account any more
  });

  it("refuses an email that already has its own Rentals homes or lease", async () => {
    const { tenant } = await setup();
    authAdmin.generateLink.mockResolvedValueOnce({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    authAdmin.generateLink.mockResolvedValueOnce({ data: { user: { id: tenant.id }, properties: { hashed_token: 'reset' } }, error: null });
    const res = await addTeam(jsonRequest({ fullName: 'Jamie', email: tenant.email, mode: 'link' }));
    expect(res.status).toBe(409);
  });

  it('never hands a landlord a password-reset link for a login that already exists', async () => {
    const { lease, tenant } = await setup();
    authAdmin.generateLink.mockResolvedValueOnce({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    authAdmin.generateLink.mockResolvedValueOnce({ data: { user: { id: tenant.id }, properties: { hashed_token: 'reset' } }, error: null });
    const body = await json(await inviteTenantRoute(jsonRequest({ mode: 'link' }), params(lease.id)));
    expect(body).toEqual({ outcome: 'existing', link: null });
  });
});

describe('documents', () => {
  it('stores a home document privately: landlords only, under their own folder', async () => {
    const { owner, home, tenant } = await setup();
    const file = { fileName: 'Homeowners 2026.pdf', contentType: 'application/pdf', size: 2000 };
    expect((await uploadTicket(jsonRequest({ ...file, contentType: 'application/x-msdownload' }), params(home.id))).status).toBe(400);
    const ticket = await json(await uploadTicket(jsonRequest(file), params(home.id)));
    expect(ticket.path).toMatch(new RegExp(`^${owner.id}/${home.id}/[0-9a-f-]{36}-Homeowners-2026.pdf$`));

    // A path outside this home's folder is refused.
    expect((await saveDoc(jsonRequest({ ...file, path: `${owner.id}/other/x.pdf`, kind: 'insurance', name: 'Policy' }), params(home.id))).status).toBe(400);
    const saved = await saveDoc(jsonRequest({ ...file, path: ticket.path, kind: 'insurance', name: 'Homeowners policy', expiresOn: '2027-01-01' }), params(home.id));
    expect(saved.status).toBe(201);
    const doc = (await json(saved)).document;
    expect(doc.storagePath).toBeUndefined();

    const listed = await json(await listDocs(getRequest(), params(home.id)));
    expect(listed.documents).toHaveLength(1);
    const open = await openDoc(getRequest(), params(doc.id));
    expect(open.status).toBe(307);
    expect(open.headers.get('location')).toBe('https://storage.example/signed');

    setCurrentUser(tenant.id);
    expect((await listDocs(getRequest(), params(home.id))).status).toBe(403);
    expect((await openDoc(getRequest(), params(doc.id))).status).toBe(403);
    setCurrentUser((await seedAccount({ role: 'landlord' })).id);
    expect((await openDoc(getRequest(), params(doc.id))).status).toBe(404);
    expect((await deleteDoc(del(), params(doc.id))).status).toBe(404);

    setCurrentUser(owner.id);
    expect((await deleteDoc(del(), params(doc.id))).status).toBe(200);
    expect(storage.removeFile).toHaveBeenCalledWith(ticket.path);
    expect(await db.select().from(documents)).toHaveLength(0);
  });
});

describe('landlord plans', () => {
  it('limits homes, makes a lapsed plan read-only, and is managed by Vachi staff only', async () => {
    const { owner, home } = await setup();
    await db.update(accounts).set({ homeLimit: 1 }).where(eq(accounts.id, owner.id));
    const blocked = await createHome(jsonRequest({ name: 'Unit 14', address: '14 Wooster Heights Rd' }));
    expect(blocked.status).toBe(403);
    expect((await json(blocked)).message).toContain('covers 1 home');

    await db.update(accounts).set({ homeLimit: null, planExpires: '2020-01-01' }).where(eq(accounts.id, owner.id));
    expect((await getHome(getRequest(), params(home.id))).status).toBe(200); // still readable
    expect((await createHome(jsonRequest({ name: 'Unit 14', address: '14 Wooster Heights Rd' }))).status).toBe(403);

    expect((await platformList()).status).toBe(404);
    const staff = await seedAccount({ role: 'landlord', email: 'staff@vachi.example' });
    await db.insert(platformAdmins).values({ accountId: staff.id });
    setCurrentUser(staff.id);
    const list = await json(await platformList());
    expect(list.landlords.find((l: any) => l.id === owner.id)).toMatchObject({ homes: 1, planExpires: '2020-01-01' });
    expect((await platformEdit(patch({ homeLimit: '5', planExpires: '2027-12-31' }), params(owner.id))).status).toBe(200);
    expect((await platformEdit(patch({ homeLimit: '5' }), params(staff.id))).status).toBe(409);

    setCurrentUser(owner.id);
    expect((await createHome(jsonRequest({ name: 'Unit 14', address: '14 Wooster Heights Rd' }))).status).toBe(201);
  });
});

describe('online rent payments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens a new checkout once the old one has expired', async () => {
    const { owner, tenant } = await setup();
    await generateRent(jsonRequest({ month: '2026-11' }));
    const [charge] = await db.select().from(rentCharges);
    await db.update(accounts).set({ stripeAccountId: 'acct_owner', stripeChargesEnabled: true }).where(eq(accounts.id, owner.id));
    setCurrentUser(tenant.id);
    stripeApi.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_a', url: 'https://checkout.stripe.com/c/cs_a' });
    await payRoute(jsonRequest({}), params(charge.id));
    stripeApi.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_a', status: 'expired', url: null });
    stripeApi.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_b', url: 'https://checkout.stripe.com/c/cs_b' });
    expect(await json(await payRoute(jsonRequest({}), params(charge.id)))).toEqual({ url: 'https://checkout.stripe.com/c/cs_b' });
    const rows = await db.select().from(rentPayments);
    expect(rows.map((r) => r.status).sort()).toEqual(['expired', 'started']);
  });

  it('starts a bank payment on the landlord’s Stripe account and adds it to the month once Stripe confirms', async () => {
    const { owner, tenant } = await setup();
    await generateRent(jsonRequest({ month: '2026-11' }));
    const [charge] = await db.select().from(rentCharges);

    setCurrentUser(tenant.id);
    expect((await payRoute(jsonRequest({}), params(charge.id))).status).toBe(409); // landlord not connected
    await db.update(accounts).set({ stripeAccountId: 'acct_owner', stripeChargesEnabled: true }).where(eq(accounts.id, owner.id));
    expect((await json(await me())).rental.onlinePayments).toBe(true);

    stripeApi.checkout.sessions.create.mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' });
    const started = await payRoute(jsonRequest({}), params(charge.id));
    expect(await json(started)).toEqual({ url: 'https://checkout.stripe.com/c/cs_1' });
    const [args, opts] = stripeApi.checkout.sessions.create.mock.calls[0];
    expect(args).toMatchObject({ payment_method_types: ['us_bank_account'], line_items: [{ price_data: { unit_amount: 240000 } }] });
    expect(opts).toMatchObject({ stripeAccount: 'acct_owner' });
    const [payment] = await db.select().from(rentPayments);

    // Starting again while that checkout is still open reuses it instead of opening a second one.
    stripeApi.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_1', status: 'open', url: 'https://checkout.stripe.com/c/cs_1' });
    expect(await json(await payRoute(jsonRequest({}), params(charge.id)))).toEqual({ url: 'https://checkout.stripe.com/c/cs_1' });
    expect(stripeApi.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(await db.select().from(rentPayments)).toHaveLength(1);

    const session = (type: string, extra = {}) =>
      ({ type, account: 'acct_owner', data: { object: { id: 'cs_1', payment_intent: 'pi_1', payment_status: 'unpaid', metadata: { rentPaymentId: payment.id }, ...extra } } }) as any;

    // An event from another Stripe account is ignored.
    await handleStripeEvent({ ...session('checkout.session.async_payment_succeeded'), account: 'acct_other' }, 'https://app');
    expect((await db.select().from(rentCharges))[0].paidAmount).toBe('0.00');

    await handleStripeEvent(session('checkout.session.completed'), 'https://app');
    expect((await db.select().from(rentPayments))[0].status).toBe('processing');
    expect((await json(await me())).rental.charges[0].processing).toBe('2400.00');
    expect((await payRoute(jsonRequest({}), params(charge.id))).status).toBe(409); // already on its way

    await handleStripeEvent(session('checkout.session.async_payment_succeeded', { payment_status: 'paid' }), 'https://app');
    await handleStripeEvent(session('checkout.session.async_payment_succeeded', { payment_status: 'paid' }), 'https://app'); // repeated by Stripe
    const [paid] = await db.select().from(rentCharges);
    expect((await db.select().from(rentPayments))[0].status).toBe('succeeded');
    expect(paid).toMatchObject({ paidAmount: '2400.00', paymentMethod: 'bank_transfer' });
    const receipts = await db.select().from(notifications).where(eq(notifications.accountId, tenant.id));
    expect(receipts.filter((n) => n.title === 'Rent received for November 2026')).toHaveLength(1);
  });
});
