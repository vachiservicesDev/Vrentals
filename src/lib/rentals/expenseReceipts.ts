import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';

export interface ReceiptLink {
  id: string;
  name: string;
  fileName: string;
}

/** Adds each entry's bill or receipt (the first one uploaded for it), if it has one. */
export async function withReceipts<T extends { id: string }>(rows: T[]): Promise<(T & { receipt: ReceiptLink | null })[]> {
  if (rows.length === 0) return [];
  const docs = await db
    .select({ id: documents.id, name: documents.name, fileName: documents.fileName, transactionId: documents.transactionId, createdAt: documents.createdAt })
    .from(documents)
    .where(inArray(documents.transactionId, rows.map((r) => r.id)));
  const first = new Map<string, ReceiptLink>();
  for (const d of docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (d.transactionId && !first.has(d.transactionId)) first.set(d.transactionId, { id: d.id, name: d.name, fileName: d.fileName });
  }
  return rows.map((r) => ({ ...r, receipt: first.get(r.id) ?? null }));
}
