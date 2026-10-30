import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases, properties, reminders } from '@/db/schema';

/** A property, only when it belongs to `ownerId`. Every landlord route goes through this. */
export async function ownedProperty(ownerId: string, propertyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) return null;
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** A lease and its property, only when the property belongs to `ownerId`. */
export async function ownedLease(ownerId: string, leaseId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(leaseId)) return null;
  const [row] = await db
    .select({ lease: leases, property: properties })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(leases.id, leaseId), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** The signed-in tenant's current lease (the newest active one) and its property. */
export async function tenantLease(userId: string) {
  const [row] = await db
    .select({ lease: leases, property: properties })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(and(eq(leases.tenantId, userId), eq(leases.status, 'active')))
    .orderBy(desc(leases.startDate))
    .limit(1);
  return row ?? null;
}

/** A reminder, only when its home belongs to the caller. */
export async function ownedReminder(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ reminder: reminders })
    .from(reminders)
    .innerJoin(properties, eq(properties.id, reminders.propertyId))
    .where(and(eq(reminders.id, id), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row?.reminder ?? null;
}
