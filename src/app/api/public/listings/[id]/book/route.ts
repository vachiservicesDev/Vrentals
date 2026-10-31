import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { showingBookings } from '@/db/schema';
import { notifyLandlords } from '@/lib/notify';
import { bookingSchema } from '@/lib/rentals/leasing';
import { openSlots, publicListing } from '@/lib/rentals/listings';

const when = (d: Date, timeZone: string) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short' });

/** Books one open showing time. Public. A time can only be booked once, even with two people clicking at once. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const listing = await publicListing(params.id);
  if (!listing) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const raw = await request.json().catch(() => ({}));
  // A hidden field people never fill in; bots do.
  if (raw?.website) return NextResponse.json({ ok: true }, { status: 201 });

  const body = bookingSchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const open = await openSlots(listing.propertyId);
  const slot = open.find((s) => s.id === body.data.slotId);
  if (!slot) return NextResponse.json({ message: 'That time was just taken. Pick another.' }, { status: 409 });

  const [booking] = await db
    .insert(showingBookings)
    .values({ slotId: slot.id, name: body.data.name, email: body.data.email, phone: body.data.phone || null, note: body.data.note || null })
    .onConflictDoNothing()
    .returning();
  if (!booking) return NextResponse.json({ message: 'That time was just taken. Pick another.' }, { status: 409 });

  await notifyLandlords(listing.ownerId, {
    title: `Showing booked: ${listing.homeName}`,
    message: `${booking.name} booked ${when(slot.startsAt, listing.timeZone)}.${booking.phone ? ` Phone ${booking.phone}.` : ''} Email ${booking.email}.${booking.note ? ` Note: "${booking.note}"` : ''}`,
    link: `/homes/${listing.propertyId}#listing`,
  });
  return NextResponse.json({ booking: { startsAt: slot.startsAt, minutes: slot.minutes } }, { status: 201 });
}
