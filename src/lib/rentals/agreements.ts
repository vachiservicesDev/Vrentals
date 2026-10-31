import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, leaseAgreements, leases, properties } from '@/db/schema';
import { ownerIdOf } from '@/lib/auth/guards';

type Account = typeof accounts.$inferSelect;

/** An agreement with its lease and home, for the home's landlords, or for its tenant once it's sent. */
export async function agreementFor(account: Account, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ agreement: leaseAgreements, lease: leases, property: properties })
    .from(leaseAgreements)
    .innerJoin(leases, eq(leases.id, leaseAgreements.leaseId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(eq(leaseAgreements.id, id))
    .limit(1);
  if (!row) return null;
  if (account.role === 'landlord') return row.property.ownerId === ownerIdOf(account) ? { ...row, as: 'landlord' as const } : null;
  // A tenant sees it once the landlord has signed and sent it, never a draft.
  return row.lease.tenantId === account.id && row.agreement.status !== 'draft' ? { ...row, as: 'tenant' as const } : null;
}

/** The live (not voided) agreement for each of these leases. */
export async function liveAgreements(leaseIds: string[]) {
  if (leaseIds.length === 0) return [];
  return db
    .select({ id: leaseAgreements.id, leaseId: leaseAgreements.leaseId, status: leaseAgreements.status, landlordSignedAt: leaseAgreements.landlordSignedAt, tenantSignedAt: leaseAgreements.tenantSignedAt })
    .from(leaseAgreements)
    .where(and(inArray(leaseAgreements.leaseId, leaseIds), ne(leaseAgreements.status, 'void')));
}
