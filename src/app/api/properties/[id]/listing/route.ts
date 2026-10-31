import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { listings } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';
import { listingSchema } from '@/lib/rentals/leasing';

const num = (v: number | '' | undefined) => (v === '' || v === undefined ? null : String(v));

/** The home's listing (or null), for the landlord. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [listing] = await db.select().from(listings).where(eq(listings.propertyId, property.id)).limit(1);
  return NextResponse.json({ listing: listing ?? null });
}

/** Creates or updates the listing. Its id, the public link, never changes. */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = listingSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const d = body.data;
  const values = {
    active: d.active,
    headline: d.headline || null,
    description: d.description || null,
    askingRent: String(d.askingRent),
    securityDeposit: num(d.securityDeposit),
    availableFrom: d.availableFrom || null,
    bedrooms: num(d.bedrooms),
    bathrooms: num(d.bathrooms),
    squareFeet: d.squareFeet === '' || d.squareFeet === undefined ? null : d.squareFeet,
    petPolicy: d.petPolicy || null,
    updatedAt: new Date(),
  };
  const [listing] = await db
    .insert(listings)
    .values({ propertyId: property.id, ...values })
    .onConflictDoUpdate({ target: listings.propertyId, set: values })
    .returning();
  return NextResponse.json({ listing });
}
