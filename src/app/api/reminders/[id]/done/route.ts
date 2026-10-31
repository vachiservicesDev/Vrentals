import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { reminders, transactions } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedReminder } from '@/lib/rentals/access';
import { REMINDER_EXPENSE_CATEGORY } from '@/lib/rentals/money';
import { nextReminderDate } from '@/lib/rentals/rent';

/**
 * Marks a reminder handled. A repeating one rolls forward to its next due date instead.
 * A reminder with an amount is recorded as an expense for the home, once per due date, paid
 * today from the business account; the landlord can change that entry under Money.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const before = await ownedReminder(gate.ownerId, params.id);
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (before.doneAt) return NextResponse.json({ message: 'This reminder is already done.' }, { status: 409 });

  if (before.amount && Number(before.amount) > 0) {
    await db
      .insert(transactions)
      .values({
        propertyId: before.propertyId,
        type: 'expense',
        category: REMINDER_EXPENSE_CATEGORY[before.kind] ?? 'other',
        date: todayEastern(),
        amount: before.amount,
        payee: before.provider,
        description: before.title,
        sourceType: 'reminder',
        sourceId: before.id,
        sourceRef: before.dueDate,
      })
      .onConflictDoNothing();
  }

  const next = nextReminderDate(before.dueDate, before.repeat);
  const [reminder] = await db
    .update(reminders)
    .set(next ? { dueDate: next, updatedAt: new Date() } : { doneAt: new Date(), updatedAt: new Date() })
    .where(eq(reminders.id, before.id))
    .returning();
  return NextResponse.json({ reminder });
}
