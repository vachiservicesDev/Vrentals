import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedProperty } from '@/lib/rentals/access';
import { documentPath, uploadRequestSchema } from '@/lib/rentals/documents';
import { createUploadUrl } from '@/lib/storage';

/** Step 1 of an upload: checks the file and hands back a one-time link to send it to private Storage. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const property = await ownedProperty(gate.ownerId, params.id);
  if (!property) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = uploadRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: body.error.issues[0]?.message ?? 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const upload = await createUploadUrl(documentPath(gate.ownerId, property.id, randomUUID(), body.data.fileName));
  return NextResponse.json(upload);
}
