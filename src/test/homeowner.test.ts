import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createHome } from '@/app/api/properties/route';
import { PATCH as updateHome } from '@/app/api/properties/[id]/route';
import { POST as createLease } from '@/app/api/properties/[id]/leases/route';
import { PUT as putListing } from '@/app/api/properties/[id]/listing/route';
import { POST as addTx } from '@/app/api/properties/[id]/transactions/route';
import { PATCH as editTx } from '@/app/api/transactions/[id]/route';
import { GET as homeReport } from '@/app/api/reports/home/route';
import { GET as pnl } from '@/app/api/reports/pnl/route';
import { buildHomeTaxSummary, saltCap } from '@/lib/rentals/homeowner';
import { resetDb, seedAccount } from './db';
import { getRequest, jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { generateLink: vi.fn() } } }) }));

const params = (id: string) => ({ params: { id } });
const patch = (body: unknown) => new NextRequest('http://localhost/test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async <T = any>(res: Response): Promise<T> => res.json() as Promise<T>;

describe('homeowner tax summary math', () => {
  const ledger = [
    { type: 'expense', category: 'mortgage_interest', date: '2026-01-01', amount: '1200.50' },
    { type: 'expense', category: 'mortgage_interest', date: '2026-02-01', amount: '1199.50' },
    { type: 'expense', category: 'property_tax', date: '2026-07-01', amount: '4000' },
    { type: 'expense', category: 'mortgage_insurance', date: '2026-03-01', amount: '600' },
    { type: 'expense', category: 'mortgage_principal', date: '2026-01-01', amount: '800' },
    { type: 'expense', category: 'insurance', date: '2026-04-01', amount: '1500' },
    { type: 'expense', category: 'utilities', date: '2026-04-01', amount: '1000' },
    { type: 'expense', category: 'repairs', date: '2026-05-01', amount: '400' },
    { type: 'expense', category: 'property_tax', date: '2025-07-01', amount: '3900' }, // last year
    { type: 'capital', category: 'improvement', date: '2024-06-01', amount: '20000' },
    { type: 'capital', category: 'clean_energy', date: '2025-05-01', amount: '10000' }, // credit $3,000
    { type: 'capital', category: 'energy_efficiency', date: '2025-08-01', amount: '6000' }, // 30% = 1,800, capped at 1,200
    { type: 'capital', category: 'energy_efficiency', date: '2026-08-01', amount: '5000' }, // no credit in 2026
    { type: 'expense', category: 'property_tax', date: '2027-01-01', amount: '999' }, // after the year
  ];
  const info = { purchasePrice: '400000', purchaseDate: '2020-05-01', homeSqft: 2000, officeSqft: 200 };

  it('splits Schedule A items from the rest, and counts PMI from 2026', () => {
    const s = buildHomeTaxSummary(ledger, info, 2026);
    expect(s.scheduleA.map((l) => [l.label, l.amount])).toEqual([
      ['Property tax', 4000],
      ['Mortgage interest', 2400],
      ['Mortgage insurance (PMI)', 600],
    ]);
    expect(s.totalScheduleA).toBe(7000);
    expect(s.salt).toMatchObject({ propertyTax: 4000, cap: 40_400, separate: 20_200, phaseOutAbove: 505_000 });
    expect(s.standardDeduction).toEqual({ single: 16_100, mfj: 32_200, hoh: 24_150 });
    expect(s.notDeductible.map((l) => l.category).sort()).toEqual(['insurance', 'mortgage_principal', 'repairs', 'utilities']);
    expect(s.totalSpending).toBe(10_700);

    // PMI isn't deductible for 2025.
    const y2025 = buildHomeTaxSummary([{ type: 'expense', category: 'mortgage_insurance', date: '2025-03-01', amount: '600' }], info, 2025);
    expect(y2025.scheduleA).toEqual([]);
    expect(y2025.pmiNotDeductible).toBe(600);
  });

  it('builds cost basis from the purchase price and every improvement, less energy credits taken', () => {
    const s = buildHomeTaxSummary(ledger, info, 2026);
    expect(s.totalImprovementsThisYear).toBe(5000);
    expect(s.basis).toEqual({ purchasePrice: 400_000, improvementsToDate: 41_000, energyCreditsToDate: 4200, adjusted: 436_800 });
    expect(buildHomeTaxSummary(ledger, { ...info, purchasePrice: null }, 2026).basis.adjusted).toBeNull();
  });

  it('estimates energy credits for 2023 to 2025 only', () => {
    const y2025 = buildHomeTaxSummary(ledger, info, 2025);
    expect(y2025.energy).toEqual({ eligible: true, efficiencySpent: 6000, efficiencyCredit: 1200, cleanSpent: 10_000, cleanCredit: 3000 });
    const y2026 = buildHomeTaxSummary(ledger, info, 2026);
    expect(y2026.energy).toMatchObject({ eligible: false, efficiencySpent: 5000, efficiencyCredit: 0 });
  });

  it('works out the home office both ways', () => {
    const s = buildHomeTaxSummary(ledger, info, 2026);
    // 200 of 2,000 sq ft: 10% of interest, tax, PMI, insurance, utilities and repairs (not principal).
    expect(s.office).toMatchObject({ sqft: 200, percent: 10, simplified: 1000 });
    expect(s.office?.regularShare).toBe(990);
    expect(s.office?.regularLines.some((l) => l.category === 'mortgage_principal')).toBe(false);
    expect(buildHomeTaxSummary(ledger, { ...info, officeSqft: 500 }, 2026).office?.simplified).toBe(1500); // 300 sq ft limit
    expect(buildHomeTaxSummary(ledger, { ...info, officeSqft: null }, 2026).office).toBeNull();
  });

  it('counts property tax only up to the SALT cap', () => {
    const s = buildHomeTaxSummary([{ type: 'expense', category: 'property_tax', date: '2026-07-01', amount: '50000' }], info, 2026);
    expect(s.scheduleA).toMatchObject([{ category: 'property_tax', amount: 40_400 }]);
    expect(s.totalScheduleA).toBe(40_400);
    expect(s.salt.propertyTax).toBe(50_000);
    expect(s.notDeductible).toEqual([]);
  });

  it('follows the SALT cap schedule', () => {
    expect(saltCap(2024).cap).toBe(10_000);
    expect(saltCap(2025)).toEqual({ cap: 40_000, separate: 20_000, phaseOutAbove: 500_000 });
    expect(saltCap(2029).cap).toBe(41_624);
    expect(saltCap(2030).cap).toBe(10_000);
  });
});

describe('Homes you live in', () => {
  let ownerId: string;
  let homeId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = (await seedAccount({ role: 'landlord', email: 'owner@example.com' })).id;
    setCurrentUser(ownerId);
    const res = await createHome(jsonRequest({ name: 'Our house', address: '5 Elm St', use: 'own', purchasePrice: '350000', placedInService: '2019-04-15', homeSqft: '1800', officeSqft: '180' }));
    expect(res.status).toBe(201);
    homeId = (await json(res)).property.id;
  });

  it("can't be leased or listed", async () => {
    const lease = await createLease(jsonRequest({ tenantName: 'Sam', tenantEmail: 'sam@example.com', startDate: '2026-01-01', monthlyRent: '2000' }), params(homeId));
    expect(lease.status).toBe(409);
    expect((await putListing(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify({}) }), params(homeId))).status).toBe(409);
  });

  it('takes homeowner categories only', async () => {
    const rentalOnly = await addTx(jsonRequest({ type: 'expense', category: 'advertising', date: '2026-03-01', amount: '50' }), params(homeId));
    expect(rentalOnly.status).toBe(400);
    const income = await addTx(jsonRequest({ type: 'income', category: 'other', date: '2026-03-01', amount: '50' }), params(homeId));
    expect(income.status).toBe(400);

    const ok = await addTx(jsonRequest({ type: 'expense', category: 'mortgage_interest', date: '2026-03-01', amount: '1100', payee: 'First Bank' }), params(homeId));
    expect(ok.status).toBe(201);
    const tx = (await json(ok)).transaction;
    expect((await editTx(patch({ type: 'expense', category: 'management', date: '2026-03-01', amount: '1100' }), params(tx.id))).status).toBe(400);
    expect((await editTx(patch({ type: 'expense', category: 'points', date: '2026-03-01', amount: '1100' }), params(tx.id))).status).toBe(200);
  });

  it('gives a year-end summary and a CSV, and stays out of the rental profit and loss', async () => {
    await addTx(jsonRequest({ type: 'expense', category: 'mortgage_interest', date: '2026-03-01', amount: '9000' }), params(homeId));
    await addTx(jsonRequest({ type: 'expense', category: 'property_tax', date: '2026-07-01', amount: '6000' }), params(homeId));
    await addTx(jsonRequest({ type: 'capital', category: 'improvement', date: '2026-09-01', amount: '15000', payee: 'Roof Co' }), params(homeId));

    const r = await json(await homeReport(getRequest('http://localhost/x?year=2026')));
    expect(r.homes).toHaveLength(1);
    expect(r.combined.totalScheduleA).toBe(15_000);
    expect(r.combined.basis.adjusted).toBe(365_000);
    expect(r.combined.office).toMatchObject({ percent: 10, simplified: 900 });
    expect(r.entries).toHaveLength(3);

    const csv = await (await homeReport(getRequest('http://localhost/x?year=2026&format=csv'))).text();
    expect(csv).toContain('Total for Schedule A,,15000.00');
    expect(csv).toContain('Adjusted cost basis,365000.00');

    const rentals = await json(await pnl(getRequest('http://localhost/x?from=2026-01-01&to=2026-12-31')));
    expect(rentals.homes).toHaveLength(0);
    expect(rentals.entries).toHaveLength(0);
  });

  it('keeps one owner out of another’s summary', async () => {
    await addTx(jsonRequest({ type: 'expense', category: 'property_tax', date: '2026-07-01', amount: '6000' }), params(homeId));
    setCurrentUser((await seedAccount({ role: 'landlord' })).id);
    expect((await homeReport(getRequest(`http://localhost/x?property=${homeId}`))).status).toBe(404);
    expect((await json(await homeReport(getRequest('http://localhost/x?year=2026')))).combined).toBeNull();
  });

  it('switches between rented out and lived in only when nothing is in the way', async () => {
    const rental = (await json(await createHome(jsonRequest({ name: 'Unit 12', address: '12 Wooster Heights Rd' })))).property;
    expect(rental.use).toBe('rental');
    await createLease(jsonRequest({ tenantName: 'Sam', tenantEmail: 'sam@example.com', startDate: '2026-01-01', monthlyRent: '2000' }), params(rental.id));
    const blocked = await updateHome(patch({ use: 'own' }), params(rental.id));
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).message).toMatch(/active lease/);
    // Ended leases still keep it a rental, so its Schedule E history isn't lost.
    const { leases } = await import('@/db/schema');
    const { db } = await import('@/db');
    await db.update(leases).set({ status: 'ended' });
    const stillBlocked = await updateHome(patch({ use: 'own' }), params(rental.id));
    expect(stillBlocked.status).toBe(409);
    expect((await json(stillBlocked)).message).toMatch(/rental history/);

    // A homeowner category that a rental doesn't have stops the switch back.
    await addTx(jsonRequest({ type: 'capital', category: 'improvement', date: '2026-09-01', amount: '100' }), params(homeId));
    expect((await updateHome(patch({ use: 'rental' }), params(homeId))).status).toBe(409);
    // Shared categories (repairs, insurance, HOA, property tax) are fine either way.
    const other = (await json(await createHome(jsonRequest({ name: 'Cabin', address: '1 Lake Rd', use: 'own' })))).property;
    await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-09-01', amount: '100' }), params(other.id));
    const switched = await updateHome(patch({ use: 'rental' }), params(other.id));
    expect(switched.status).toBe(200);
    expect((await json(switched)).property.use).toBe('rental');
  });
});
