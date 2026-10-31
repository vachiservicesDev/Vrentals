import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rentCharges, leases, properties } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { chargeDetails, sendReceipt } from '@/lib/rentals/receipt';
import { dec, paymentSchema } from '@/lib/rentals/schemas';

/**
 * Records what the tenant has paid toward one month (the running total, not an increment). When the
 * total goes up, the tenant gets a receipt in the app, and by email when email is set up.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const [found] = await db
    .select({ charge: rentCharges, lease: leases })
    .from(rentCharges)
    .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(rentCharges.id, params.id), eq(properties.ownerId, gate.ownerId)))
    .limit(1);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = paymentSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const { paidAmount, paidOn, paymentMethod, note } = body.data;
  const [charge] = await db
    .update(rentCharges)
    .set({
      paidAmount: dec(paidAmount)!,
      paidOn: paidAmount > 0 ? (paidOn ?? todayEastern()) : null,
      paymentMethod: paidAmount > 0 ? (paymentMethod ?? null) : null,
      ...(note !== undefined ? { note: note || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(rentCharges.id, found.charge.id))
    .returning();

  let receipt: { emailed: boolean; emailError?: string } | null = null;
  if (Number(charge.paidAmount) > Number(found.charge.paidAmount)) {
    const details = await chargeDetails(charge.id);
    if (details) receipt = await sendReceipt(details, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  }
  return NextResponse.json({ charge, receipt });
}
