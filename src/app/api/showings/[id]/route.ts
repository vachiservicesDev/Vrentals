import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { showingBookings, showingSlots } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedSlot } from '@/lib/rentals/access';

/** Removes an open showing time. A booked time has to be cancelled first, so nobody shows up to nothing unannounced. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const slot = await ownedSlot(gate.ownerId, params.id);
  if (!slot) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [booked] = await db.select({ id: showingBookings.id }).from(showingBookings).where(and(eq(showingBookings.slotId, slot.id), eq(showingBookings.status, 'booked'))).limit(1);
  if (booked) return NextResponse.json({ message: 'Someone booked this time. Cancel their booking first.' }, { status: 409 });
  await db.delete(showingSlots).where(eq(showingSlots.id, slot.id));
  return NextResponse.json({ ok: true });
}
