import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/db';
import { properties, transactions } from '@/db/schema';
import { buildHomeTaxSummary, homeCategoryOf, type HomeTaxSummary } from './homeowner';

export interface HomeReportEntry {
  id: string;
  date: string;
  home: string;
  type: string;
  category: string;
  label: string;
  form: string | null;
  payee: string | null;
  description: string | null;
  amount: number;
}

export interface HomeReport {
  year: number;
  homes: { id: string; name: string; address: string; summary: HomeTaxSummary }[];
  /** Every home added together: what goes on one Schedule A. */
  combined: HomeTaxSummary | null;
  entries: HomeReportEntry[];
}

/** The year-end homeowner summary for the owner's lived-in homes (or one of them). */
export async function buildHomeReport(ownerId: string, year: number, propertyId?: string): Promise<HomeReport> {
  const homes = await db
    .select()
    .from(properties)
    .where(and(eq(properties.ownerId, ownerId), eq(properties.use, 'own'), propertyId ? eq(properties.id, propertyId) : undefined))
    .orderBy(asc(properties.name));
  const ids = homes.map((h) => h.id);
  const to = `${year}-12-31`;
  const ledger = ids.length
    ? await db.select().from(transactions).where(and(inArray(transactions.propertyId, ids), lte(transactions.date, to))).orderBy(asc(transactions.date))
    : [];

  const perHome = homes.map((h) => ({
    id: h.id,
    name: h.name,
    address: [h.address, h.city, h.state].filter(Boolean).join(', '),
    summary: buildHomeTaxSummary(
      ledger.filter((t) => t.propertyId === h.id),
      { purchasePrice: h.purchasePrice, purchaseDate: h.placedInService, homeSqft: h.homeSqft, officeSqft: h.officeSqft },
      year,
    ),
  }));

  // Several homes (a main home and a second home) share one Schedule A. Basis and office are per home.
  const combined =
    homes.length === 0 ? null : homes.length === 1 ? perHome[0].summary : buildHomeTaxSummary(ledger, { purchasePrice: null, purchaseDate: null, homeSqft: null, officeSqft: null }, year);

  const name = new Map(homes.map((h) => [h.id, h.name]));
  const entries = ledger
    .filter((t) => t.date >= `${year}-01-01`)
    .map((t) => {
      const cat = homeCategoryOf(t.type, t.category);
      return {
        id: t.id,
        date: t.date,
        home: name.get(t.propertyId) ?? '',
        type: t.type,
        category: t.category,
        label: cat?.label ?? t.category,
        form: cat?.form ?? null,
        payee: t.payee,
        description: t.description,
        amount: Number(t.amount),
      };
    });

  return { year, homes: perHome, combined, entries };
}
