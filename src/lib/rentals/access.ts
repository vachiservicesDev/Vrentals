import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { applications, documents, leases, properties, reminders, showingSlots, transactions } from '@/db/schema';

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

/** A ledger entry, only when its home belongs to the caller. */
export async function ownedTransaction(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ transaction: transactions })
    .from(transactions)
    .innerJoin(properties, eq(properties.id, transactions.propertyId))
    .where(and(eq(transactions.id, id), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row?.transaction ?? null;
}

/** A document, only when its home belongs to the caller. */
export async function ownedDocument(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ document: documents })
    .from(documents)
    .innerJoin(properties, eq(properties.id, documents.propertyId))
    .where(and(eq(documents.id, id), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row?.document ?? null;
}

/** A rental application, only when its home belongs to the caller. */
export async function ownedApplication(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ application: applications, property: properties })
    .from(applications)
    .innerJoin(properties, eq(properties.id, applications.propertyId))
    .where(and(eq(applications.id, id), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** A showing time, only when its home belongs to the caller. */
export async function ownedSlot(ownerId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ slot: showingSlots })
    .from(showingSlots)
    .innerJoin(properties, eq(properties.id, showingSlots.propertyId))
    .where(and(eq(showingSlots.id, id), eq(properties.ownerId, ownerId)))
    .limit(1);
  return row?.slot ?? null;
}

/** Said when someone tries to rent out, list or lease a home marked as the one they live in. */
export const OWN_HOME_NOT_RENTED = 'This is marked as the home you live in. To rent it out, change "How do you use this home?" under Home details first.';
