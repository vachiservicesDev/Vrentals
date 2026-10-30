import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { reminders } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedReminder } from '@/lib/rentals/access';
import { nextReminderDate } from '@/lib/rentals/rent';

/** Marks a reminder handled. A repeating one rolls forward to its next due date instead. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const before = await ownedReminder(gate.account.id, params.id);
  if (!before) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (before.doneAt) return NextResponse.json({ message: 'This reminder is already done.' }, { status: 409 });

  const next = nextReminderDate(before.dueDate, before.repeat);
  const [reminder] = await db
    .update(reminders)
    .set(next ? { dueDate: next, updatedAt: new Date() } : { doneAt: new Date(), updatedAt: new Date() })
    .where(eq(reminders.id, before.id))
    .returning();
  return NextResponse.json({ reminder });
}
