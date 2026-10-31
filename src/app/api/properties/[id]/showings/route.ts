import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { showingBookings, showingSlots } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';
import { slotsSchema } from '@/lib/rentals/leasing';
import { localInstant } from '@/lib/rentals/listings';
import { stateTimeZone } from '@/lib/rentals/states';

/** Upcoming showing times (from the start of today) with who booked each. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const slots = await db
    .select()
    .from(showingSlots)
    .where(and(eq(showingSlots.propertyId, property.id), gt(showingSlots.startsAt, since)))
    .orderBy(asc(showingSlots.startsAt));
  const bookings = slots.length
    ? await db
        .select()
        .from(showingBookings)
        .where(and(inArray(showingBookings.slotId, slots.map((s) => s.id)), eq(showingBookings.status, 'booked')))
    : [];
  const bySlot = new Map(bookings.map((b) => [b.slotId, b]));
  return NextResponse.json({ slots: slots.map((s) => ({ ...s, booking: bySlot.get(s.id) ?? null })) });
}

/** Adds showing times on one day. Times already there are skipped. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = slotsSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: body.error.issues[0]?.message ?? 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const { date, times, minutes } = body.data;

  const starts = [...new Set(times)].map((t) => localInstant(date, t, stateTimeZone(property.state))).filter((d) => d.getTime() > Date.now());
  if (starts.length === 0) return NextResponse.json({ message: 'Pick times that are still ahead.' }, { status: 400 });
  const existing = await db
    .select({ startsAt: showingSlots.startsAt })
    .from(showingSlots)
    .where(and(eq(showingSlots.propertyId, property.id), inArray(showingSlots.startsAt, starts)));
  const have = new Set(existing.map((e) => e.startsAt.getTime()));
  const fresh = starts.filter((s) => !have.has(s.getTime()));
  const created = fresh.length ? await db.insert(showingSlots).values(fresh.map((startsAt) => ({ propertyId: property.id, startsAt, minutes }))).returning() : [];
  return NextResponse.json({ created: created.length }, { status: 201 });
}
