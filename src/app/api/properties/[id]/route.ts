import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents, rentCharges, leases, listings, properties, reminders, repairRequests, transactions } from '@/db/schema';
import { removeFile } from '@/lib/storage';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedProperty } from '@/lib/rentals/access';
import { liveAgreements } from '@/lib/rentals/agreements';
import { homeCategoryOf } from '@/lib/rentals/homeowner';
import { categoryOf } from '@/lib/rentals/money';
import { pendingPayments } from '@/lib/rentals/payments';
import { chargeStatus } from '@/lib/rentals/rent';
import { propertySchema, propertyValues } from '@/lib/rentals/schemas';

/** One home with everything on its page: leases, rent ledger, repairs and reminders. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const [leaseRows, repairs, reminderRows] = await Promise.all([
    db.select().from(leases).where(eq(leases.propertyId, property.id)).orderBy(desc(leases.startDate)),
    db.select().from(repairRequests).where(eq(repairRequests.propertyId, property.id)).orderBy(desc(repairRequests.createdAt)),
    db.select().from(reminders).where(eq(reminders.propertyId, property.id)).orderBy(asc(reminders.dueDate)),
  ]);
  const charges = leaseRows.length
    ? await db.select().from(rentCharges).where(inArray(rentCharges.leaseId, leaseRows.map((l) => l.id))).orderBy(desc(rentCharges.period))
    : [];

  const agreements = await liveAgreements(leaseRows.map((l) => l.id));
  const processing = new Map((await pendingPayments(charges.map((c) => c.id))).map((p) => [p.chargeId, p.amount]));
  const today = todayEastern();
  const grace = new Map(leaseRows.map((l) => [l.id, l.graceDays]));
  return NextResponse.json({
    property,
    landlordName: gate.account.fullName,
    leases: leaseRows.map((l) => ({ ...l, agreement: agreements.find((a) => a.leaseId === l.id) ?? null })),
    charges: charges.map((c) => ({ ...c, status: chargeStatus(c, grace.get(c.leaseId) ?? 0, today), processing: processing.get(c.id) ?? null })),
    repairs,
    reminders: reminderRows,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = propertySchema.partial().safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  if (body.data.use && body.data.use !== property.use) {
    const blocked = await changeBlocked(property.id, body.data.use);
    if (blocked) return NextResponse.json({ message: blocked, errors: { fieldErrors: { use: [blocked] } } }, { status: 409 });
  }

  // A cleared optional field arrives as an empty string; store it as empty (null).
  const values = propertyValues(body.data);
  const [updated] = await db
    .update(properties)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(properties.id, property.id))
    .returning();
  return NextResponse.json({ property: updated });
}

/** Removes a home and everything under it (leases, rent history, repairs, reminders, money, documents). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const files = await db.select({ path: documents.storagePath }).from(documents).where(eq(documents.propertyId, property.id));
  await db.delete(properties).where(eq(properties.id, property.id));
  // The rows go with the home; the stored files are removed too (a failure here only leaves files behind).
  await Promise.all(files.map((f) => removeFile(f.path).catch((err) => console.error('[delete home] file not removed', err))));
  return NextResponse.json({ ok: true });
}

/**
 * Why a home can't switch between rented out and lived in, or null when it can. A home you live
 * in can't have a tenant or a live listing, and every money entry has to fit the new categories.
 */
async function changeBlocked(propertyId: string, to: 'rental' | 'own'): Promise<string | null> {
  if (to === 'own') {
    const [lease] = await db.select({ id: leases.id }).from(leases).where(and(eq(leases.propertyId, propertyId), eq(leases.status, 'active'))).limit(1);
    if (lease) return 'This home has an active lease. End the lease before marking it as the home you live in.';
    const [listing] = await db.select({ id: listings.id }).from(listings).where(and(eq(listings.propertyId, propertyId), eq(listings.active, true))).limit(1);
    if (listing) return 'This home is listed for rent. Take the listing down before marking it as the home you live in.';
  }
  const rows = await db.select({ type: transactions.type, category: transactions.category }).from(transactions).where(eq(transactions.propertyId, propertyId));
  const fits = (r: { type: string; category: string }) => (to === 'own' ? homeCategoryOf(r.type, r.category) : categoryOf(r.type, r.category));
  const misfits = rows.filter((r) => !fits(r)).length;
  if (misfits) return `${misfits} money ${misfits === 1 ? 'entry doesn\'t' : "entries don't"} fit ${to === 'own' ? 'a home you live in' : 'a rental'}. Change or delete ${misfits === 1 ? 'it' : 'them'} under Money first.`;
  return null;
}
