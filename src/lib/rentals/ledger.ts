import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { repairRequests, transactions } from '@/db/schema';

/**
 * A fixed repair with a cost is a Repairs expense on the day it was fixed. This keeps that entry
 * in step with the repair: written when it's marked fixed, updated when the cost or vendor
 * changes, and removed if the cost is cleared or the repair is reopened.
 */
export async function syncRepairExpense(repair: typeof repairRequests.$inferSelect): Promise<void> {
  const link = and(eq(transactions.sourceType, 'repair'), eq(transactions.sourceId, repair.id), eq(transactions.sourceRef, 'repair'));
  const cost = repair.cost ? Number(repair.cost) : 0;
  if (repair.status !== 'done' || !(cost > 0)) {
    await db.delete(transactions).where(link);
    return;
  }
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(repair.completedAt ?? new Date());
  const values = { amount: repair.cost!, date, payee: repair.vendorName, description: repair.title, updatedAt: new Date() };
  await db
    .insert(transactions)
    .values({ propertyId: repair.propertyId, type: 'expense', category: 'repairs', paidFrom: 'business', sourceType: 'repair', sourceId: repair.id, sourceRef: 'repair', ...values })
    .onConflictDoUpdate({ target: [transactions.sourceType, transactions.sourceId, transactions.sourceRef], set: values });
}
