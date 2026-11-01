import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { POST as createHome } from '@/app/api/properties/route';
import { POST as addTx } from '@/app/api/properties/[id]/transactions/route';
import { GET as allTx } from '@/app/api/transactions/route';
import { POST as saveDocument } from '@/app/api/properties/[id]/documents/route';
import { PATCH as updateAccount } from '@/app/api/account/route';
import { ACTIVE_STEP, landlordStep, tenantStep } from '@/lib/rentals/leasingPath';
import { resetDb, seedAccount } from './db';
import { getRequest, jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';
import { NextRequest } from 'next/server';

vi.mock('@/lib/storage', () => ({ storedFile: async () => ({ size: 1234 }) }));

const params = (id: string) => ({ params: { id } });
const today = '2026-11-01';

describe('leasing progress', () => {
  const lease = (agreement: 'draft' | 'sent' | 'signed' | null, extra: Partial<{ startDate: string; tenantId: string | null }> = {}) => ({
    startDate: '2026-12-01',
    tenantId: null,
    agreement: agreement ? { status: agreement } : null,
    ...extra,
  });

  it('follows a vacant home from listing to an approved applicant', () => {
    expect(landlordStep({ applications: [], lease: null, inspections: 0, today })).toBe(0);
    expect(landlordStep({ applications: [{ status: 'declined' }], lease: null, inspections: 0, today })).toBe(0);
    expect(landlordStep({ applications: [{ status: 'new' }], lease: null, inspections: 0, today })).toBe(1);
    expect(landlordStep({ applications: [{ status: 'new' }, { status: 'approved' }], lease: null, inspections: 0, today })).toBe(2);
  });

  it('moves through drafting, signing and move-in, then the lease is active', () => {
    expect(landlordStep({ applications: [], lease: lease(null), inspections: 0, today })).toBe(2);
    expect(landlordStep({ applications: [], lease: lease('draft'), inspections: 0, today })).toBe(2);
    expect(landlordStep({ applications: [], lease: lease('sent'), inspections: 0, today })).toBe(3);
    expect(landlordStep({ applications: [], lease: lease('signed'), inspections: 0, today })).toBe(4);
    expect(landlordStep({ applications: [], lease: lease('signed', { tenantId: 'x' }), inspections: 0, today })).toBe(4);
    expect(landlordStep({ applications: [], lease: lease('signed', { tenantId: 'x' }), inspections: 1, today })).toBe(ACTIVE_STEP);
  });

  it('treats a lease that was already running before written leases as active', () => {
    expect(landlordStep({ applications: [], lease: lease(null, { startDate: '2025-06-01' }), inspections: 0, today })).toBe(ACTIVE_STEP);
  });

  it('shows the tenant signing, then move-in until the start date', () => {
    expect(tenantStep({ agreement: { status: 'sent' }, startDate: '2026-12-01', today })).toBe(3);
    expect(tenantStep({ agreement: { status: 'signed' }, startDate: '2026-12-01', today })).toBe(4);
    expect(tenantStep({ agreement: { status: 'signed' }, startDate: '2026-11-01', today })).toBe(ACTIVE_STEP);
    expect(tenantStep({ agreement: null, startDate: '2026-12-01', today })).toBe(ACTIVE_STEP);
  });
});

describe('expenses with receipts', () => {
  let ownerId: string;
  let homeId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = (await seedAccount()).id;
    setCurrentUser(ownerId);
    const res = await createHome(jsonRequest({ name: 'Unit 12', address: '12 Wooster Heights Rd' }));
    homeId = (await res.json()).property.id;
  });

  async function receipt(propertyId: string, transactionId: string) {
    return saveDocument(
      jsonRequest({ fileName: 'bill.pdf', contentType: 'application/pdf', size: 1234, path: `${ownerId}/${propertyId}/r-${transactionId}-bill.pdf`, kind: 'receipt', name: 'Plumber bill', transactionId }),
      params(propertyId),
    );
  }

  it('links a receipt to its expense and lists the year across homes', async () => {
    const tx = await (await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-10-28', amount: '385', payee: 'Brookfield Plumbing' }), params(homeId))).json();
    await addTx(jsonRequest({ type: 'expense', category: 'hoa', date: '2025-10-15', amount: '185' }), params(homeId)); // last year
    expect((await receipt(homeId, tx.transaction.id)).status).toBe(201);

    const res = await allTx(getRequest('http://localhost/api/transactions?year=2026'));
    const body = await res.json();
    expect(body.homes).toEqual([{ id: homeId, name: 'Unit 12', use: 'rental' }]);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({ amount: '385.00', home: { id: homeId }, receipt: { name: 'Plumber bill', fileName: 'bill.pdf' } });
  });

  it("won't link a receipt to another home's expense", async () => {
    const other = (await (await createHome(jsonRequest({ name: 'Other', address: '1 Main St' }))).json()).property.id;
    const tx = await (await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-10-28', amount: '50' }), params(other))).json();
    expect((await receipt(homeId, tx.transaction.id)).status).toBe(400);
    expect(await db.select().from(documents)).toHaveLength(0);
  });

  it("hides other landlords' expenses", async () => {
    await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-10-28', amount: '50' }), params(homeId));
    setCurrentUser((await seedAccount()).id);
    const body = await (await allTx(getRequest('http://localhost/api/transactions?year=2026'))).json();
    expect(body).toEqual({ year: 2026, homes: [], transactions: [] });
  });
});

describe('account kind', () => {
  beforeEach(async () => {
    await resetDb();
  });

  const patch = (body: unknown) => new NextRequest('http://localhost/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('lets a landlord switch to homeowner menus, but not a tenant', async () => {
    const landlord = await seedAccount();
    setCurrentUser(landlord.id);
    const res = await updateAccount(patch({ fullName: 'Ravi', kind: 'homeowner' }));
    expect((await res.json()).account.kind).toBe('homeowner');

    const tenant = await seedAccount({ role: 'tenant' });
    setCurrentUser(tenant.id);
    expect((await (await updateAccount(patch({ fullName: 'Tina', kind: 'homeowner' }))).json()).account.kind).toBe('landlord');
  });
});
