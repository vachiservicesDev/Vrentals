import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { leases, properties, rentCharges, transactions } from '@/db/schema';
import { buildStatement, buildingDepreciation, categoryOf, rentDate, rentalDays, type Statement } from './money';

export interface ReportEntry {
  id: string;
  date: string;
  propertyId: string;
  home: string;
  type: string;
  category: string;
  label: string;
  line: number;
  payee: string | null;
  description: string | null;
  paidFrom: string | null;
  amount: number;
  source: string | null;
}

export interface HomeSummary {
  id: string;
  name: string;
  income: number;
  expenses: number;
  net: number;
  depreciation: number | null;
  rentalDays: number;
}

export interface Report {
  from: string;
  to: string;
  /** Set when the range is exactly one calendar year: depreciation is only estimated then. */
  taxYear: number | null;
  statement: Statement;
  depreciation: number | null;
  /** Net after the depreciation estimate, for a tax year. */
  taxableEstimate: number | null;
  homes: HomeSummary[];
  entries: ReportEntry[];
  missingDepreciation: string[];
}

/** Profit and loss for the owner's rental homes (or one of them) over a date range, with every entry behind it. */
export async function buildReport(ownerId: string, from: string, to: string, propertyId?: string): Promise<Report> {
  const homes = await db
    .select()
    .from(properties)
    // Homes the owner lives in aren't rentals: they're on the homeowner summary instead.
    .where(and(eq(properties.ownerId, ownerId), eq(properties.use, 'rental'), propertyId ? eq(properties.id, propertyId) : undefined))
    .orderBy(asc(properties.name));
  const ids = homes.map((h) => h.id);
  const name = new Map(homes.map((h) => [h.id, h.name]));

  const [leaseRows, ledger] = ids.length
    ? await Promise.all([
        db.select().from(leases).where(inArray(leases.propertyId, ids)),
        // Deposits count up to `to` from the start; everything else is filtered by date below.
        db.select().from(transactions).where(and(inArray(transactions.propertyId, ids), lte(transactions.date, to))).orderBy(asc(transactions.date)),
      ])
    : [[], []];
  const leaseHome = new Map(leaseRows.map((l) => [l.id, l.propertyId]));
  const charges = leaseRows.length
    ? await db.select().from(rentCharges).where(and(inArray(rentCharges.leaseId, leaseRows.map((l) => l.id)), gt(rentCharges.paidAmount, '0')))
    : [];
  const rent = charges.map((c) => ({ ...c, propertyId: leaseHome.get(c.leaseId)! }));

  const statement = buildStatement(rent, ledger, from, to);
  const [fy, fm, fd] = from.split('-');
  const taxYear = fm === '01' && fd === '01' && to === `${fy}-12-31` ? Number(fy) : null;

  const missingDepreciation: string[] = [];
  const depreciationFor = (h: (typeof homes)[number]) => {
    if (taxYear === null) return null;
    let total = 0;
    if (h.purchasePrice && h.placedInService) total += buildingDepreciation(Number(h.purchasePrice) - Number(h.landValue ?? 0), h.placedInService, taxYear);
    else missingDepreciation.push(h.name);
    // Building improvements follow the same 27.5-year schedule from the day they were paid for.
    for (const t of ledger) if (t.propertyId === h.id && t.type === 'capital' && t.category === 'building') total += buildingDepreciation(Number(t.amount), t.date, taxYear);
    return Math.round(total * 100) / 100;
  };

  const homeSummaries = homes.map((h) => {
    const s = buildStatement(
      rent.filter((r) => r.propertyId === h.id),
      ledger.filter((t) => t.propertyId === h.id),
      from,
      to,
    );
    return {
      id: h.id,
      name: h.name,
      income: s.totalIncome,
      expenses: s.totalExpenses,
      net: s.net,
      depreciation: depreciationFor(h),
      rentalDays: rentalDays(leaseRows.filter((l) => l.propertyId === h.id), from, to),
    };
  });
  const depreciation = taxYear === null ? null : Math.round(homeSummaries.reduce((a, h) => a + (h.depreciation ?? 0), 0) * 100) / 100;

  const inRange = (d: string) => d >= from && d <= to;
  const entries: ReportEntry[] = [
    ...rent
      .filter((r) => inRange(rentDate(r)))
      .map((r) => ({
        id: r.id,
        date: rentDate(r),
        propertyId: r.propertyId,
        home: name.get(r.propertyId) ?? '',
        type: 'income',
        category: 'rent',
        label: `Rent for ${new Date(`${r.period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
        line: 3,
        payee: leaseRows.find((l) => l.id === r.leaseId)?.tenantName ?? null,
        description: r.note,
        paidFrom: null,
        amount: Number(r.paidAmount),
        source: 'rent',
      })),
    ...ledger
      .filter((t) => inRange(t.date))
      .map((t) => {
        const cat = categoryOf(t.type, t.category);
        return {
          id: t.id,
          date: t.date,
          propertyId: t.propertyId,
          home: name.get(t.propertyId) ?? '',
          type: t.type,
          category: t.category,
          label: cat?.label ?? t.category,
          line: cat?.line ?? 0,
          payee: t.payee,
          description: t.description,
          paidFrom: t.type === 'expense' || t.type === 'capital' ? t.paidFrom : null,
          amount: Number(t.amount),
          source: t.sourceType,
        };
      }),
  ].sort((a, b) => (a.date === b.date ? a.home.localeCompare(b.home) : a.date.localeCompare(b.date)));

  return {
    from,
    to,
    taxYear,
    statement,
    depreciation,
    taxableEstimate: depreciation === null ? null : Math.round((statement.net - depreciation) * 100) / 100,
    homes: homeSummaries,
    entries,
    missingDepreciation: taxYear === null ? [] : missingDepreciation,
  };
}
