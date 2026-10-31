import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedLease } from '@/lib/rentals/access';
import { dec, leaseUpdateSchema } from '@/lib/rentals/schemas';

/** Edits a lease, or ends it (which also stops the tenant seeing it). */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const found = await ownedLease(gate.ownerId, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = leaseUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const { status, endDate, tenantPhone, monthlyRent } = body.data;
  const ending = status === 'ended' && found.lease.status !== 'ended';
  const [lease] = await db
    .update(leases)
    .set({
      ...(status ? { status } : {}),
      ...(endDate !== undefined ? { endDate: endDate || null } : ending && !found.lease.endDate ? { endDate: todayEastern() } : {}),
      ...(tenantPhone !== undefined ? { tenantPhone: tenantPhone || null } : {}),
      ...(monthlyRent !== undefined ? { monthlyRent: dec(monthlyRent)! } : {}),
      updatedAt: new Date(),
    })
    .where(eq(leases.id, found.lease.id))
    .returning();

  return NextResponse.json({ lease });
}
