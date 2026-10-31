import { NextResponse } from 'next/server';
import { openSlots, publicListing } from '@/lib/rentals/listings';

/** A home for rent and its open showing times. Public: no sign-in. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const listing = await publicListing(params.id);
  if (!listing) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const { ownerId: _o, propertyId: _p, ...shown } = listing;
  return NextResponse.json({ listing: shown, slots: await openSlots(listing.propertyId) });
}
