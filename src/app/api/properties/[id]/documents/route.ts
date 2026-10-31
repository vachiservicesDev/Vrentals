import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';
import { documentSchema } from '@/lib/rentals/documents';
import { storedFile } from '@/lib/storage';

/** A home's documents. Landlords (and co-landlords) only; there is no tenant route to these. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(documents).where(eq(documents.propertyId, property.id)).orderBy(desc(documents.createdAt));
  // The storage path is internal; downloads go through /api/documents/[id].
  return NextResponse.json({ documents: rows.map(({ storagePath: _path, ...d }) => d) });
}

/** Step 2 of an upload: once the file is in Storage, records what it is. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = documentSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const { path, expiresOn, notes, ...rest } = body.data;

  // Only a file uploaded for this home (step 1 put it under owner/home/), and only once it's really there.
  if (!path.startsWith(`${gate.ownerId}/${property.id}/`) || path.includes('..')) return NextResponse.json({ message: 'Upload the file again.' }, { status: 400 });
  const stored = await storedFile(path);
  if (!stored) return NextResponse.json({ message: "The file didn't finish uploading. Try again." }, { status: 400 });

  const [document] = await db
    .insert(documents)
    .values({ ...rest, size: stored.size || rest.size, storagePath: path, propertyId: property.id, uploadedBy: gate.account.id, expiresOn: expiresOn || null, notes: notes || null })
    .onConflictDoNothing({ target: documents.storagePath })
    .returning();
  if (!document) return NextResponse.json({ message: 'That file is already saved.' }, { status: 409 });
  const { storagePath: _path, ...shown } = document;
  return NextResponse.json({ document: shown }, { status: 201 });
}
