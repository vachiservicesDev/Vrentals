import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { properties, transactions } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { withReceipts } from '@/lib/rentals/expenseReceipts';

/**
 * Every money entry across the caller's homes for one year (`year`, default this year), newest
 * first, each with its home and receipt. Also the homes, for the form's "Which home" list.
 */
export async function GET(request: NextRequest) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const asked = Number(request.nextUrl.searchParams.get('year'));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : new Date().getFullYear();
  const [homes, rows] = await Promise.all([
    db.select({ id: properties.id, name: properties.name, use: properties.use }).from(properties).where(eq(properties.ownerId, gate.ownerId)).orderBy(asc(properties.name)),
    db
      .select({ transaction: transactions, home: { id: properties.id, name: properties.name, use: properties.use } })
      .from(transactions)
      .innerJoin(properties, eq(properties.id, transactions.propertyId))
      .where(and(eq(properties.ownerId, gate.ownerId), gte(transactions.date, `${year}-01-01`), lte(transactions.date, `${year}-12-31`)))
      .orderBy(desc(transactions.date), desc(transactions.createdAt)),
  ]);
  const entries = await withReceipts(rows.map((r) => ({ ...r.transaction, home: r.home })));
  return NextResponse.json({ year, homes, transactions: entries });
}
