import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { POST as createHome } from '@/app/api/properties/route';
import { PATCH as updateHome } from '@/app/api/properties/[id]/route';
import { POST as createLease } from '@/app/api/properties/[id]/leases/route';
import { POST as generateRent } from '@/app/api/charges/generate/route';
import { PATCH as recordPayment } from '@/app/api/charges/[id]/route';
import { GET as listTx, POST as addTx } from '@/app/api/properties/[id]/transactions/route';
import { DELETE as deleteTx, PATCH as editTx } from '@/app/api/transactions/[id]/route';
import { POST as createReminder } from '@/app/api/properties/[id]/reminders/route';
import { POST as reminderDone } from '@/app/api/reminders/[id]/done/route';
import { PATCH as updateRepair } from '@/app/api/repairs/[id]/route';
import { POST as logRepair } from '@/app/api/properties/[id]/repairs/route';
import { GET as pnl } from '@/app/api/reports/pnl/route';
import { buildStatement, buildingDepreciation, csvField, rentalDays } from '@/lib/rentals/money';
import { todayEastern } from '@/lib/dates';
import { resetDb, seedAccount } from './db';
import { getRequest, jsonRequest } from './http';
import { setCurrentUser } from './mockAuth';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { generateLink: vi.fn() } } }) }));

const params = (id: string) => ({ params: { id } });
const patch = (body: unknown) => new NextRequest('http://localhost/test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async <T = any>(res: Response): Promise<T> => res.json() as Promise<T>;

describe('profit and loss math', () => {
  const rent = [
    { propertyId: 'a', period: '2026-01-01', paidOn: '2026-01-02', paidAmount: '2400' },
    { propertyId: 'a', period: '2026-12-01', paidOn: '2027-01-03', paidAmount: '2400' }, // received next year
    { propertyId: 'a', period: '2026-02-01', paidOn: null, paidAmount: '1000' }, // no date: counts in its month
  ];
  const ledger = [
    { propertyId: 'a', type: 'expense', category: 'repairs', date: '2026-03-01', amount: '300.10', paidFrom: 'personal' },
    { propertyId: 'a', type: 'expense', category: 'cleaning', date: '2026-03-02', amount: '150' },
    { propertyId: 'a', type: 'expense', category: 'maintenance', date: '2026-03-03', amount: '50' },
    { propertyId: 'a', type: 'income', category: 'late_fee', date: '2026-01-15', amount: '50' },
    { propertyId: 'a', type: 'capital', category: 'building', date: '2026-05-01', amount: '9000', paidFrom: 'personal' },
    { propertyId: 'a', type: 'deposit', category: 'received', date: '2025-12-20', amount: '4800' },
    { propertyId: 'a', type: 'deposit', category: 'returned', date: '2026-06-01', amount: '4000' },
    { propertyId: 'a', type: 'income', category: 'deposit_kept', date: '2026-06-01', amount: '800' },
  ];

  it('counts rent when received, keeps deposits and improvements out of profit, and totals Schedule E lines', () => {
    const s = buildStatement(rent, ledger, '2026-01-01', '2026-12-31');
    expect(s.income.map((l) => [l.label, l.amount])).toEqual([
      ['Rent', 3400],
      ['Deposit kept for damages or rent', 800],
      ['Late fees', 50],
    ]);
    expect(s.totalIncome).toBe(4250);
    expect(s.totalExpenses).toBe(500.1);
    expect(s.net).toBe(3749.9);
    expect(s.totalImprovements).toBe(9000);
    expect(s.paidPersonally).toBe(9300.1);
    expect(s.deposits).toEqual({ received: 4800, returned: 4000, held: 800 });
    // Cleaning and maintenance share line 7; all income is line 3.
    expect(s.scheduleE).toEqual([
      { line: 3, label: 'Rents received', amount: 4250 },
      { line: 7, label: 'Cleaning and maintenance', amount: 200 },
      { line: 14, label: 'Repairs', amount: 300.1 },
    ]);
  });

  it('estimates 27.5-year mid-month depreciation', () => {
    // $275,000 building placed in service in January: 11.5 months the first year.
    expect(buildingDepreciation(275_000, '2026-01-10', 2026)).toBe(9583.33);
    expect(buildingDepreciation(275_000, '2026-01-10', 2027)).toBe(10000);
    expect(buildingDepreciation(275_000, '2026-07-01', 2026)).toBe(4583.33); // 5.5 months
    expect(buildingDepreciation(275_000, '2026-07-01', 2025)).toBe(0);
    // Fully depreciated after 27.5 years: the 28th year gets only what's left (IRS table: 1.970%).
    expect(buildingDepreciation(275_000, '2026-01-10', 2052)).toBe(10000);
    expect(buildingDepreciation(275_000, '2026-01-10', 2053)).toBe(5416.67);
    expect(buildingDepreciation(275_000, '2026-01-10', 2054)).toBe(0);
  });

  it('counts rented days without double counting overlapping leases', () => {
    const leases = [
      { startDate: '2025-06-01', endDate: '2026-03-31' },
      { startDate: '2026-03-15', endDate: null },
    ];
    expect(rentalDays(leases, '2026-01-01', '2026-12-31')).toBe(365);
    expect(rentalDays([{ startDate: '2026-12-01', endDate: null }], '2026-01-01', '2026-12-31')).toBe(31);
    expect(rentalDays([], '2026-01-01', '2026-12-31')).toBe(0);
  });

  it('writes CSV fields that are safe to open in a spreadsheet', () => {
    expect(csvField('Home Depot, Danbury')).toBe('"Home Depot, Danbury"');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField(-12.5)).toBe('-12.5');
    expect(csvField(null)).toBe('');
  });
});

describe('Money', () => {
  let landlordId: string;
  let homeId: string;

  beforeEach(async () => {
    await resetDb();
    landlordId = (await seedAccount({ role: 'landlord', email: 'owner@example.com' })).id;
    setCurrentUser(landlordId);
    homeId = (await json(await createHome(jsonRequest({ name: 'Unit 12', address: '12 Wooster Heights Rd' })))).property.id;
  });

  it('adds, edits and deletes expenses, and checks the category fits the kind', async () => {
    const bad = await addTx(jsonRequest({ type: 'income', category: 'repairs', date: '2026-03-01', amount: '100' }), params(homeId));
    expect(bad.status).toBe(400);
    expect((await json(bad)).errors.fieldErrors.category).toBeTruthy();

    const res = await addTx(jsonRequest({ type: 'expense', category: 'cleaning', date: '2026-03-01', amount: '150', payee: 'Sparkle Co', paidFrom: 'personal' }), params(homeId));
    expect(res.status).toBe(201);
    const tx = (await json(res)).transaction;
    expect(tx).toMatchObject({ amount: '150.00', paidFrom: 'personal', payee: 'Sparkle Co' });

    const edited = await json(await editTx(patch({ type: 'expense', category: 'cleaning', date: '2026-03-02', amount: '175', payee: '', paidFrom: 'business' }), params(tx.id)));
    expect(edited.transaction).toMatchObject({ amount: '175.00', paidFrom: 'business', payee: null, date: '2026-03-02' });

    const listed = await json(await listTx(getRequest('http://localhost/x?from=2026-01-01&to=2026-12-31'), params(homeId)));
    expect(listed.transactions).toHaveLength(1);
    expect((await deleteTx(new Request('http://localhost'), params(tx.id))).status).toBe(200);
  });

  it("another landlord can't see or change this home's money", async () => {
    const tx = (await json(await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-03-01', amount: '100' }), params(homeId)))).transaction;
    setCurrentUser((await seedAccount({ role: 'landlord' })).id);
    expect((await listTx(getRequest(), params(homeId))).status).toBe(404);
    expect((await addTx(jsonRequest({ type: 'expense', category: 'repairs', date: '2026-03-01', amount: '1' }), params(homeId))).status).toBe(404);
    expect((await editTx(patch({ type: 'expense', category: 'repairs', date: '2026-03-01', amount: '1' }), params(tx.id))).status).toBe(404);
    expect((await deleteTx(new Request('http://localhost'), params(tx.id))).status).toBe(404);
    expect((await pnl(getRequest(`http://localhost/x?property=${homeId}`))).status).toBe(404);
    const mine = await json(await pnl(getRequest('http://localhost/x?from=2026-01-01&to=2026-12-31')));
    expect(mine.entries).toHaveLength(0);
  });

  it('records a paid bill as an expense once per due date', async () => {
    const reminder = (await json(await createReminder(jsonRequest({ kind: 'hoa', title: 'HOA dues', provider: 'Wooster Heights HOA', amount: '325', dueDate: '2026-11-01', repeat: 'monthly' }), params(homeId)))).reminder;
    await reminderDone(new Request('http://localhost'), params(reminder.id));
    await reminderDone(new Request('http://localhost'), params(reminder.id)); // now the December one
    const rows = await db.select().from(transactions).where(eq(transactions.propertyId, homeId));
    expect(rows.map((r) => [r.category, r.amount, r.sourceRef, r.payee])).toEqual([
      ['hoa', '325.00', '2026-11-01', 'Wooster Heights HOA'],
      ['hoa', '325.00', '2026-12-01', 'Wooster Heights HOA'],
    ]);
    expect(rows[0].date).toBe(todayEastern());
  });

  it("keeps a fixed repair's cost in the ledger in step with the repair", async () => {
    const repair = (await json(await logRepair(jsonRequest({ title: 'Dishwasher not draining' }), params(homeId)))).repair;
    const ledger = () => db.select().from(transactions).where(eq(transactions.propertyId, homeId));

    await updateRepair(patch({ cost: '180', vendorName: 'Danbury Appliance' }), params(repair.id));
    expect(await ledger()).toHaveLength(0); // not fixed yet

    await updateRepair(patch({ status: 'done' }), params(repair.id));
    expect((await ledger()).map((t) => [t.category, t.amount, t.payee, t.description])).toEqual([['repairs', '180.00', 'Danbury Appliance', 'Dishwasher not draining']]);

    await updateRepair(patch({ cost: '210' }), params(repair.id));
    const [row] = await ledger();
    expect(row.amount).toBe('210.00');
    // It's edited on the repair, not in the ledger.
    expect((await editTx(patch({ type: 'expense', category: 'repairs', date: '2026-03-01', amount: '1' }), params(row.id))).status).toBe(409);
    expect((await deleteTx(new Request('http://localhost'), params(row.id))).status).toBe(409);

    await updateRepair(patch({ status: 'open' }), params(repair.id));
    expect(await ledger()).toHaveLength(0);
  });

  it('builds the yearly report with rent, expenses, depreciation and a CSV', async () => {
    await updateHome(patch({ purchasePrice: '325000', landValue: '50000', placedInService: '2025-01-10' }), params(homeId));
    const lease = (await json(await createLease(jsonRequest({ tenantName: 'Jamie Lee', tenantEmail: 'jamie@example.com', startDate: '2026-01-01', monthlyRent: '2400' }), params(homeId)))).lease;
    await generateRent(jsonRequest({ month: '2026-01' }));
    const { charges } = await json(await (await import('@/app/api/properties/[id]/route')).GET(new Request('http://localhost'), params(homeId)));
    await recordPayment(patch({ paidAmount: '2400', paidOn: '2026-01-03', paymentMethod: 'zelle' }), params(charges[0].id));
    expect(charges[0].leaseId).toBe(lease.id);
    await addTx(jsonRequest({ type: 'expense', category: 'insurance', date: '2026-02-01', amount: '1180', payee: 'Travelers, Inc.' }), params(homeId));
    await addTx(jsonRequest({ type: 'deposit', category: 'received', date: '2026-01-01', amount: '4800' }), params(homeId));

    const report = await json(await pnl(getRequest('http://localhost/x?from=2026-01-01&to=2026-12-31')));
    expect(report.taxYear).toBe(2026);
    expect(report.statement.totalIncome).toBe(2400);
    expect(report.statement.totalExpenses).toBe(1180);
    expect(report.depreciation).toBe(10000); // $275,000 building, full second year
    expect(report.taxableEstimate).toBe(-8780);
    expect(report.statement.deposits.held).toBe(4800);
    expect(report.homes[0].rentalDays).toBe(365);
    expect(report.entries.map((e: any) => e.label)).toEqual(['Deposit received', 'Rent for January 2026', 'Insurance']);

    // A custom range isn't a tax year, so no depreciation estimate.
    const quarter = await json(await pnl(getRequest('http://localhost/x?from=2026-01-01&to=2026-03-31')));
    expect(quarter.depreciation).toBeNull();

    const csv = await pnl(getRequest(`http://localhost/x?from=2026-01-01&to=2026-12-31&property=${homeId}&format=csv`));
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('rentals-profit-and-loss-unit-12-2026-01-01-to-2026-12-31.csv');
    const text = await csv.text();
    expect(text).toContain('Income,3,Rent,2400.00');
    expect(text).toContain('Result,18,Depreciation (estimate),10000.00');
    expect(text).toContain('2026-02-01,Unit 12,expense,Insurance,9,"Travelers, Inc.",,Business,1180.00');
  });
});
