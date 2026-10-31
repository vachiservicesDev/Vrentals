import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { documents } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedDocument } from '@/lib/rentals/access';
import { downloadUrl, removeFile } from '@/lib/storage';

/** Opens a document: sends the browser to a download link that works for one minute. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const doc = await ownedDocument(gate.ownerId, params.id);
  if (!doc) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const res = NextResponse.redirect(await downloadUrl(doc.storagePath, doc.fileName));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const doc = await ownedDocument(gate.ownerId, params.id);
  if (!doc) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  await removeFile(doc.storagePath);
  await db.delete(documents).where(eq(documents.id, doc.id));
  return NextResponse.json({ ok: true });
}
