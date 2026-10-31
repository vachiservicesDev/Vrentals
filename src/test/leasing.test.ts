import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { applications, leaseAgreements, notifications, showingBookings } from '@/db/schema';
import { POST as createHome } from '@/app/api/properties/route';
import { GET as getHome } from '@/app/api/properties/[id]/route';
import { POST as createLease } from '@/app/api/properties/[id]/leases/route';
import { GET as getListing, PUT as putListing } from '@/app/api/properties/[id]/listing/route';
import { GET as listSlots, POST as addSlots } from '@/app/api/properties/[id]/showings/route';
import { DELETE as removeSlot } from '@/app/api/showings/[id]/route';
import { GET as listApplications } from '@/app/api/properties/[id]/applications/route';
import { PATCH as updateApplication } from '@/app/api/applications/[id]/route';
import { GET as publicListing } from '@/app/api/public/listings/[id]/route';
import { POST as book } from '@/app/api/public/listings/[id]/book/route';
import { POST as apply } from '@/app/api/public/listings/[id]/apply/route';
import { POST as prepare } from '@/app/api/leases/[id]/agreement/route';
import { GET as getAgreement } from '@/app/api/agreements/[id]/route';
import { POST as sign } from '@/app/api/agreements/[id]/sign/route';
import { POST as voidAgreement } from '@/app/api/agreements/[id]/void/route';
import { GET as me } from '@/app/api/me/route';
import { renderLease, sha256 } from '@/lib/rentals/leaseTemplate';
import { sameName } from '@/lib/rentals/leasing';
import { resetDb, seedAccount } from './db';
import { getRequest, jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

const params = (id: string) => ({ params: { id } });
const json = async <T = any>(res: Response): Promise<T> => res.json() as Promise<T>;
const put = (body: unknown) => new NextRequest('http://localhost/test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const patch = (body: unknown) => new NextRequest('http://localhost/test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const del = () => new Request('http://localhost', { method: 'DELETE' });
const signed = (name: string, ip = '203.0.113.7') =>
  new NextRequest('http://localhost/test', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ signedName: name, consent: true }) });

/** A day at least a few days out, as YYYY-MM-DD. */
const future = (days = 5) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const APPLICANT = {
  fullName: 'Morgan Diaz',
  email: 'Morgan@Example.com',
  phone: '(203) 555-0199',
  moveInDate: '2026-12-01',
  currentAddress: '5 Main St, Bethel CT',
  monthlyIncome: '7500',
  adults: '2',
  evictionHistory: 'no',
  certify: true,
  signedName: 'Morgan Diaz',
};

async function vacantHome() {
  await resetDb();
  const owner = await seedAccount({ role: 'landlord', email: 'ravi@example.com', fullName: 'Ravi Peddyreddy' });
  setCurrentUser(owner.id);
  const home = (await json(await createHome(jsonRequest({ name: 'Unit 12', address: '12 Wooster Heights Rd', city: 'Danbury', zip: '06810' })))).property;
  return { owner, home };
}

async function listed() {
  const ctx = await vacantHome();
  const res = await putListing(put({ active: true, headline: 'Sunny 2-bed townhome', askingRent: '2400', securityDeposit: '2400', bedrooms: '2', bathrooms: '1.5' }), params(ctx.home.id));
  expect(res.status).toBe(200);
  const { listing } = await json(res);
  return { ...ctx, listing };
}

describe('listings and showings', () => {
  it('publishes a listing without exposing who owns it, and hides it once turned off', async () => {
    const { owner, home, listing } = await listed();
    setCurrentUser(null);
    const pub = await json(await publicListing(getRequest(), params(listing.id)));
    expect(pub.listing).toMatchObject({ homeName: 'Unit 12', headline: 'Sunny 2-bed townhome', landlordName: 'Ravi Peddyreddy' });
    expect(pub.listing.ownerId).toBeUndefined();
    expect(pub.listing.propertyId).toBeUndefined();

    setCurrentUser(owner.id);
    await putListing(put({ active: false, askingRent: '2400' }), params(home.id));
    setCurrentUser(null);
    expect((await publicListing(getRequest(), params(listing.id))).status).toBe(404);
  });

  it('adds showing times, books each one only once, and tells the landlord', async () => {
    const { owner, home, listing } = await listed();
    const day = future();
    const added = await json(await addSlots(jsonRequest({ date: day, times: ['10:00', '11:00'], minutes: 30 }), params(home.id)));
    expect(added.created).toBe(2);
    // The same times again are skipped, not duplicated.
    expect((await json(await addSlots(jsonRequest({ date: day, times: ['10:00'] }), params(home.id)))).created).toBe(0);
    const { slots } = await json(await listSlots(getRequest(), params(home.id)));
    expect(slots).toHaveLength(2);

    setCurrentUser(null);
    const visitor = { slotId: slots[0].id, name: 'Morgan Diaz', email: 'morgan@example.com', phone: '203-555-0199' };
    // Two people booking the same time at once: one wins.
    const [a, b] = await Promise.all([book(jsonRequest(visitor), params(listing.id)), book(jsonRequest({ ...visitor, name: 'Sam' }), params(listing.id))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db.select().from(showingBookings)).toHaveLength(1);
    // The booked time no longer shows publicly.
    expect((await json(await publicListing(getRequest(), params(listing.id)))).slots).toHaveLength(1);

    const [note] = await db.select().from(notifications).where(eq(notifications.accountId, owner.id));
    expect(note.title).toBe('Showing booked: Unit 12');

    // A booked time can't be deleted (cancel the booking first); an open one can.
    setCurrentUser(owner.id);
    expect((await removeSlot(del(), params(slots[0].id))).status).toBe(409);
    expect((await removeSlot(del(), params(slots[1].id))).status).toBe(200);
  });

  it('quietly drops bot submissions caught by the hidden field', async () => {
    const { home, listing } = await listed();
    await addSlots(jsonRequest({ date: future(), times: ['10:00'] }), params(home.id));
    const { slots } = await json(await listSlots(getRequest(), params(home.id)));
    setCurrentUser(null);
    expect((await book(jsonRequest({ slotId: slots[0].id, name: 'Bot', email: 'bot@example.com', website: 'spam.example' }), params(listing.id))).status).toBe(201);
    expect((await apply(jsonRequest({ ...APPLICANT, website: 'spam.example' }), params(listing.id))).status).toBe(201);
    expect(await db.select().from(showingBookings)).toHaveLength(0);
    expect(await db.select().from(applications)).toHaveLength(0);
  });

  it("keeps one landlord's listing and showings away from another", async () => {
    const { home } = await listed();
    const other = await seedAccount({ role: 'landlord', email: 'other@example.com', fullName: 'Other' });
    setCurrentUser(other.id);
    expect((await getListing(getRequest(), params(home.id))).status).toBe(404);
    expect((await listSlots(getRequest(), params(home.id))).status).toBe(404);
    expect((await listApplications(getRequest(), params(home.id))).status).toBe(404);
  });
});

describe('applications', () => {
  it('takes an application, refuses a quick duplicate, and lets the landlord approve it', async () => {
    const { owner, home, listing } = await listed();
    setCurrentUser(null);
    // No SSN or birth date is asked, and certifying is required.
    expect((await apply(jsonRequest({ ...APPLICANT, certify: false }), params(listing.id))).status).toBe(400);
    expect((await apply(jsonRequest(APPLICANT), params(listing.id))).status).toBe(201);
    expect((await apply(jsonRequest(APPLICANT), params(listing.id))).status).toBe(409);

    setCurrentUser(owner.id);
    const list = await json(await listApplications(getRequest(), params(home.id)));
    expect(list.askingRent).toBe('2400.00');
    const [app] = list.applications;
    expect(app).toMatchObject({ fullName: 'Morgan Diaz', email: 'morgan@example.com', status: 'new', signedName: 'Morgan Diaz' });
    expect(app.answers).toMatchObject({ monthlyIncome: 7500, currentAddress: '5 Main St, Bethel CT', evictionHistory: 'no' });
    expect(app.answers.certify).toBeUndefined();

    const updated = await json(await updateApplication(patch({ status: 'approved', landlordNotes: 'Called references.' }), params(app.id)));
    expect(updated.application).toMatchObject({ status: 'approved', landlordNotes: 'Called references.' });
    expect(updated.application.decidedAt).toBeTruthy();
  });
});

describe('written lease', () => {
  const terms = { landlordName: 'Ravi Peddyreddy', landlordAddress: '1 Main St, Danbury CT 06810', utilitiesTenant: 'electricity', smoking: 'not_allowed', builtBefore1978: true };

  async function leased() {
    const ctx = await vacantHome();
    const tenant = await seedAccount({ role: 'tenant', email: 'jamie@example.com', fullName: 'Jamie Lee' });
    const lease = (
      await json(
        await createLease(
          jsonRequest({ tenantName: 'Jamie Lee', tenantEmail: 'jamie@example.com', startDate: '2026-12-01', endDate: '2027-11-30', monthlyRent: '2400', dueDay: 1, lateFee: '50', securityDeposit: '2400' }),
          params(ctx.home.id),
        ),
      )
    ).lease;
    await db.execute(`update rentals.leases set tenant_id = '${tenant.id}' where id = '${lease.id}'` as never);
    return { ...ctx, tenant, lease };
  }

  it('fills in the Connecticut template from the lease', () => {
    const text = renderLease(
      { tenantName: 'Jamie Lee', tenantEmail: 'j@example.com', homeName: 'Unit 12', homeAddress: '12 Wooster Heights Rd, Danbury, CT 06810', startDate: '2026-12-01', endDate: '2027-11-30', monthlyRent: '2400', dueDay: 1, graceDays: 9, lateFee: '50', securityDeposit: '2400' },
      { ...terms, smoking: 'not_allowed', builtBefore1978: true },
    );
    expect(text).toContain('between Ravi Peddyreddy ("Landlord") and Jamie Lee ("Tenant")');
    expect(text).toContain('begins on December 1, 2026 and ends on November 30, 2027');
    expect(text).toContain('Rent is $2,400.00 per month, due in advance on the 1st day');
    expect(text).toContain('C.G.S. § 47a-15a');
    expect(text).toContain('LEAD-BASED PAINT DISCLOSURE');
    expect(sha256(text)).toMatch(/^[0-9a-f]{64}$/);
    expect(sameName('ravi  PEDDYREDDY', 'Ravi Peddyreddy')).toBe(true);
    expect(sameName('Ravi P', 'Ravi Peddyreddy')).toBe(false);
  });

  it('is prepared, signed by the landlord, then by the tenant, and saved with the lease', async () => {
    const { owner, home, tenant, lease } = await leased();
    const draft = (await json(await prepare(jsonRequest(terms), params(lease.id)))).agreement;
    expect(draft.status).toBe('draft');
    // Preparing again while it's a draft updates the same one.
    const again = await prepare(jsonRequest({ ...terms, parking: 'Space #14' }), params(lease.id));
    expect(again.status).toBe(200);
    expect((await json(again)).agreement.id).toBe(draft.id);

    // The tenant can't see a draft.
    setCurrentUser(tenant.id);
    expect((await getAgreement(getRequest(), params(draft.id))).status).toBe(404);
    expect((await json(await me())).rental.agreement).toBeNull();
    expect((await sign(signed('Jamie Lee'), params(draft.id))).status).toBe(404);

    // The landlord must sign with the name in the lease.
    setCurrentUser(owner.id);
    expect((await sign(signed('Someone Else'), params(draft.id))).status).toBe(400);
    const sent = await sign(signed('ravi peddyreddy'), params(draft.id));
    expect(sent.status).toBe(200);
    expect(await json(sent)).toEqual({ status: 'sent', tenantHasLogin: true });
    // Once signed, the terms are fixed.
    expect((await prepare(jsonRequest(terms), params(lease.id))).status).toBe(409);

    setCurrentUser(tenant.id);
    expect((await json(await me())).rental.agreement).toEqual({ id: draft.id, status: 'sent' });
    const view = await json(await getAgreement(getRequest(), params(draft.id)));
    expect(view.as).toBe('tenant');
    expect(view.agreement.body).toContain('Space #14');
    expect(view.agreement.landlordSignedIp).toBeUndefined();
    expect(view.agreement.terms).toBeUndefined();
    const [tenantNote] = await db.select().from(notifications).where(eq(notifications.accountId, tenant.id));
    expect(tenantNote).toMatchObject({ title: 'Your lease is ready to sign', link: `/agreements/${draft.id}` });

    expect((await sign(signed('Jamie Leeson'), params(draft.id))).status).toBe(400);
    expect((await json(await sign(signed('Jamie Lee', '198.51.100.4'), params(draft.id)))).status).toBe('signed');
    expect((await sign(signed('Jamie Lee'), params(draft.id))).status).toBe(409);

    setCurrentUser(owner.id);
    const final = await json(await getAgreement(getRequest(), params(draft.id)));
    expect(final.agreement).toMatchObject({ status: 'signed', landlordName: 'ravi peddyreddy', tenantName: 'Jamie Lee', landlordSignedIp: '203.0.113.7', tenantSignedIp: '198.51.100.4' });
    const homeView = await json(await getHome(getRequest(), params(home.id)));
    expect(homeView.leases[0].agreement).toMatchObject({ id: draft.id, status: 'signed' });
  });

  it('refuses to sign text that changed after it was prepared', async () => {
    const { lease } = await leased();
    const draft = (await json(await prepare(jsonRequest(terms), params(lease.id)))).agreement;
    await db.update(leaseAgreements).set({ body: `${draft.body}\nTenant also pays $10,000.` }).where(eq(leaseAgreements.id, draft.id));
    expect((await sign(signed('Ravi Peddyreddy'), params(draft.id))).status).toBe(409);
  });

  it('can be voided and prepared fresh, and stays private to its own landlords', async () => {
    const { owner, lease } = await leased();
    const draft = (await json(await prepare(jsonRequest(terms), params(lease.id)))).agreement;
    await sign(signed('Ravi Peddyreddy'), params(draft.id));

    const other = await seedAccount({ role: 'landlord', email: 'other@example.com', fullName: 'Other' });
    setCurrentUser(other.id);
    expect((await getAgreement(getRequest(), params(draft.id))).status).toBe(404);
    expect((await voidAgreement(jsonRequest({}), params(draft.id))).status).toBe(404);
    expect((await prepare(jsonRequest(terms), params(lease.id))).status).toBe(404);

    setCurrentUser(owner.id);
    expect((await voidAgreement(jsonRequest({}), params(draft.id))).status).toBe(200);
    const fresh = await prepare(jsonRequest(terms), params(lease.id));
    expect(fresh.status).toBe(201);
    expect((await json(fresh)).agreement.id).not.toBe(draft.id);
  });
});

