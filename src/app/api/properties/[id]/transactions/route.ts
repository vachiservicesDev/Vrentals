import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';
import { dec, transactionSchema } from '@/lib/rentals/schemas';

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A home's money ledger, newest first. `from` and `to` (YYYY-MM-DD) narrow it to a date range. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const from = request.nextUrl.searchParams.get('from');
  const to = request.nextUrl.searchParams.get('to');
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.propertyId, property.id), isDay(from) ? gte(transactions.date, from) : undefined, isDay(to) ? lte(transactions.date, to) : undefined))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
  return NextResponse.json({ transactions: rows });
}

/** Adds an expense, an income entry or a deposit to a home. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = transactionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const d = body.data;
  const [transaction] = await db
    .insert(transactions)
    .values({ propertyId: property.id, type: d.type, category: d.category, date: d.date, amount: dec(d.amount)!, payee: d.payee || null, paidFrom: d.paidFrom, description: d.description || null })
    .returning();
  return NextResponse.json({ transaction }, { status: 201 });
}
