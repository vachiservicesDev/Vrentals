import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { licenseInvites } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';

/** Cancels an invitation link that hasn't been used yet, so nobody can sign up with it. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [invite] = await db
    .update(licenseInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(licenseInvites.id, params.id), isNull(licenseInvites.usedBy), isNull(licenseInvites.revokedAt)))
    .returning({ id: licenseInvites.id });
  if (!invite) return NextResponse.json({ message: 'That link was already used or cancelled.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
