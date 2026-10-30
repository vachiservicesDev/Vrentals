import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { rentCharges, leases, properties } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { dueDateFor, leaseCoversPeriod, periodStart } from '@/lib/rentals/rent';

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month.') });

/**
 * Adds a month's rent for every active lease the caller owns that covers that month. Safe to run
 * again: a lease that already has that month is skipped, so nothing is ever charged twice.
 */
export async function POST(request: NextRequest) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const period = periodStart(body.data.month);
  const leaseRows = await db
    .select({ lease: leases })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(properties.ownerId, gate.account.id), eq(leases.status, 'active')));

  const rows = leaseRows
    .map((r) => r.lease)
    .filter((l) => leaseCoversPeriod(l, period))
    .map((l) => ({ leaseId: l.id, period, dueDate: dueDateFor(period, l.dueDay), amount: l.monthlyRent }));

  const created = rows.length
    ? await db.insert(rentCharges).values(rows).onConflictDoNothing({ target: [rentCharges.leaseId, rentCharges.period] }).returning({ id: rentCharges.id })
    : [];
  return NextResponse.json({ created: created.length, skipped: rows.length - created.length });
}
