import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { rentCharges, leases, properties, reminders, repairRequests } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedProperty } from '@/lib/rentals/access';
import { chargeStatus } from '@/lib/rentals/rent';
import { propertySchema } from '@/lib/rentals/schemas';

/** One home with everything on its page: leases, rent ledger, repairs and reminders. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.account.id, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const [leaseRows, repairs, reminderRows] = await Promise.all([
    db.select().from(leases).where(eq(leases.propertyId, property.id)).orderBy(desc(leases.startDate)),
    db.select().from(repairRequests).where(eq(repairRequests.propertyId, property.id)).orderBy(desc(repairRequests.createdAt)),
    db.select().from(reminders).where(eq(reminders.propertyId, property.id)).orderBy(asc(reminders.dueDate)),
  ]);
  const charges = leaseRows.length
    ? await db.select().from(rentCharges).where(inArray(rentCharges.leaseId, leaseRows.map((l) => l.id))).orderBy(desc(rentCharges.period))
    : [];

  const today = todayEastern();
  const grace = new Map(leaseRows.map((l) => [l.id, l.graceDays]));
  return NextResponse.json({
    property,
    leases: leaseRows,
    charges: charges.map((c) => ({ ...c, status: chargeStatus(c, grace.get(c.leaseId) ?? 0, today) })),
    repairs,
    reminders: reminderRows,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.account.id, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = propertySchema.partial().safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  // A cleared optional field arrives as an empty string; store it as empty (null).
  const values = Object.fromEntries(Object.entries(body.data).map(([k, v]) => [k, v === '' ? null : v]));
  const [updated] = await db
    .update(properties)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(properties.id, property.id))
    .returning();
  return NextResponse.json({ property: updated });
}

/** Removes a home and everything under it (leases, rent history, repairs, reminders). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const property = await ownedProperty(gate.account.id, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  await db.delete(properties).where(eq(properties.id, property.id));
  return NextResponse.json({ ok: true });
}
