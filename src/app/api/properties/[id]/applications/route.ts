import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { applications, listings } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';

/** Every application for the home, newest first, with the listing's rent to compare incomes against. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [rows, [listing]] = await Promise.all([
    db.select().from(applications).where(eq(applications.propertyId, property.id)).orderBy(desc(applications.createdAt)),
    db.select({ askingRent: listings.askingRent }).from(listings).where(eq(listings.propertyId, property.id)).limit(1),
  ]);
  return NextResponse.json({ applications: rows, askingRent: listing?.askingRent ?? null });
}
