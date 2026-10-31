import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { showingBookings } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedSlot } from '@/lib/rentals/access';

/** Cancels the booking on a showing time; the time opens up again. The landlord tells the visitor. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const slot = await ownedSlot(gate.ownerId, params.id);
  if (!slot) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [cancelled] = await db
    .update(showingBookings)
    .set({ status: 'cancelled' })
    .where(and(eq(showingBookings.slotId, slot.id), eq(showingBookings.status, 'booked')))
    .returning();
  if (!cancelled) return NextResponse.json({ message: 'This time has no booking.' }, { status: 409 });
  return NextResponse.json({ booking: cancelled });
}
