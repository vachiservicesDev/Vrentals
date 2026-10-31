import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { applications } from '@/db/schema';
import { notifyLandlords } from '@/lib/notify';
import { applicationSchema } from '@/lib/rentals/leasing';
import { publicListing } from '@/lib/rentals/listings';

/** Takes a rental application for the home. Public. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const listing = await publicListing(params.id);
  if (!listing) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const raw = await request.json().catch(() => ({}));
  if (raw?.website) return NextResponse.json({ ok: true }, { status: 201 });

  const body = applicationSchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const { fullName, email, phone, moveInDate, signedName, certify: _c, ...answers } = body.data;

  // The same person sending again within a day updates nothing; their first application stands.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.propertyId, listing.propertyId), eq(applications.email, email), gt(applications.createdAt, dayAgo)))
    .limit(1);
  if (recent) return NextResponse.json({ message: 'We already have your application for this home. The landlord will be in touch.' }, { status: 409 });

  const [application] = await db
    .insert(applications)
    .values({ propertyId: listing.propertyId, fullName, email, phone, moveInDate: moveInDate || null, answers, signedName })
    .returning({ id: applications.id });
  await notifyLandlords(listing.ownerId, {
    title: `New application: ${listing.homeName}`,
    message: `${fullName} applied${moveInDate ? `, hoping to move in ${moveInDate}` : ''}. Review it on the home's page.`,
    link: `/homes/${listing.propertyId}#applications`,
  });
  return NextResponse.json({ application }, { status: 201 });
}
