import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { transactions } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedTransaction } from '@/lib/rentals/access';
import { dec, transactionSchema } from '@/lib/rentals/schemas';

const FROM_REPAIR = 'This cost comes from a repair. Change it on the repair, under Repairs.';

/** Edits a ledger entry. The form sends every field, so this replaces them all. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const before = await ownedTransaction(gate.account.id, params.id);
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (before.sourceType === 'repair') return NextResponse.json({ message: FROM_REPAIR }, { status: 409 });

  const body = transactionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const d = body.data;
  const [transaction] = await db
    .update(transactions)
    .set({ type: d.type, category: d.category, date: d.date, amount: dec(d.amount)!, payee: d.payee || null, paidFrom: d.paidFrom, description: d.description || null, updatedAt: new Date() })
    .where(eq(transactions.id, before.id))
    .returning();
  return NextResponse.json({ transaction });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const before = await ownedTransaction(gate.account.id, params.id);
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (before.sourceType === 'repair') return NextResponse.json({ message: FROM_REPAIR }, { status: 409 });

  await db.delete(transactions).where(eq(transactions.id, before.id));
  return NextResponse.json({ ok: true });
}
