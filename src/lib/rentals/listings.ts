import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, listings, properties, showingBookings, showingSlots } from '@/db/schema';
import { planLapsed } from './plans';

/**
 * A listing as the public sees it: only when it's switched on and its landlord's account is in good
 * standing. Never includes the landlord's email, notes, or who booked which time.
 */
export async function publicListing(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ listing: listings, property: properties, owner: accounts })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .innerJoin(accounts, eq(accounts.id, properties.ownerId))
    .where(eq(listings.id, id))
    .limit(1);
  if (!row || !row.listing.active || !row.owner.isActive || planLapsed(row.owner)) return null;
  const { listing: l, property: p, owner } = row;
  return {
    id: l.id,
    propertyId: p.id,
    ownerId: owner.id,
    homeName: p.name,
    // The street address is shared: people need it to come to a showing.
    address: [p.address, p.city, `${p.state} ${p.zip ?? ''}`.trim()].filter(Boolean).join(', '),
    landlordName: owner.fullName,
    headline: l.headline,
    description: l.description,
    askingRent: l.askingRent,
    securityDeposit: l.securityDeposit,
    availableFrom: l.availableFrom,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    squareFeet: l.squareFeet,
    petPolicy: l.petPolicy,
  };
}

/** Showing times still open: in the future (at least an hour out) and not booked. */
export async function openSlots(propertyId: string, now = new Date()) {
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  const slots = await db
    .select()
    .from(showingSlots)
    .where(and(eq(showingSlots.propertyId, propertyId), gt(showingSlots.startsAt, soon)))
    .orderBy(asc(showingSlots.startsAt));
  if (slots.length === 0) return [];
  const booked = await db
    .select({ slotId: showingBookings.slotId })
    .from(showingBookings)
    .where(and(inArray(showingBookings.slotId, slots.map((s) => s.id)), eq(showingBookings.status, 'booked')));
  const taken = new Set(booked.map((b) => b.slotId));
  return slots.filter((s) => !taken.has(s.id)).map((s) => ({ id: s.id, startsAt: s.startsAt, minutes: s.minutes }));
}

/** "2026-11-04" + "17:30" in Connecticut time, as a UTC instant (handles daylight saving). */
export function easternInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const shown = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() + (asUtc.getTime() - shown.getTime()));
}

export function clientIp(headers: Headers): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null;
}
