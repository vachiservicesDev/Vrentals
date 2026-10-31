import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases, properties } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { canAddHome } from '@/lib/rentals/plans';
import { propertySchema, propertyValues } from '@/lib/rentals/schemas';

/** The caller's own rental homes, each with its current tenant (if any). */
export async function GET() {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const homes = await db.select().from(properties).where(eq(properties.ownerId, gate.ownerId)).orderBy(asc(properties.name));
  const leaseRows = await db
    .select({ propertyId: leases.propertyId, tenantName: leases.tenantName, monthlyRent: leases.monthlyRent, endDate: leases.endDate })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(properties.ownerId, gate.ownerId), eq(leases.status, 'active')));

  const list = homes.map((p) => {
    const lease = leaseRows.find((l) => l.propertyId === p.id);
    return { ...p, tenantName: lease?.tenantName ?? null, monthlyRent: lease?.monthlyRent ?? null, leaseEnds: lease?.endDate ?? null };
  });
  return NextResponse.json({ properties: list });
}

export async function POST(request: NextRequest) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const body = propertySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const [{ n }] = await db.select({ n: count() }).from(properties).where(eq(properties.ownerId, gate.ownerId));
  if (!canAddHome(gate.owner, Number(n))) {
    return NextResponse.json({ message: `Your plan covers ${gate.owner.homeLimit} ${gate.owner.homeLimit === 1 ? 'home' : 'homes'}. Contact Vachi Services to add more.` }, { status: 403 });
  }

  const [property] = await db.insert(properties).values({ ...(propertyValues(body.data) as typeof properties.$inferInsert), ownerId: gate.ownerId }).returning();
  return NextResponse.json({ property }, { status: 201 });
}
