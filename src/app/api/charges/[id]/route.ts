import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rentCharges, leases, properties } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { notify } from '@/lib/notify';
import { todayEastern } from '@/lib/dates';
import { monthName, usdText } from '@/lib/rentals/rent';
import { dec, paymentSchema } from '@/lib/rentals/schemas';

/** Records what the tenant has paid toward one month (the running total, not an increment). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const [found] = await db
    .select({ charge: rentCharges, lease: leases })
    .from(rentCharges)
    .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(rentCharges.id, params.id), eq(properties.ownerId, gate.account.id)))
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

  if (found.lease.tenantId && Number(charge.paidAmount) > Number(found.charge.paidAmount)) {
    await notify({
      accountId: found.lease.tenantId,
      title: 'Payment received',
      message: `Your landlord recorded ${usdText(charge.paidAmount)} toward ${monthName(charge.period)} rent.`,
      link: '/home',
    });
  }
  return NextResponse.json({ charge });
}

