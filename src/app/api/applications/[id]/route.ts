import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { applications } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedApplication } from '@/lib/rentals/access';
import { applicationUpdateSchema } from '@/lib/rentals/leasing';

/** Moves an application along (reviewing, approved, declined) and keeps the landlord's private notes. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const found = await ownedApplication(gate.ownerId, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const body = applicationUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const { status, landlordNotes } = body.data;
  const decided = status === 'approved' || status === 'declined';
  const [application] = await db
    .update(applications)
    .set({
      ...(status ? { status, decidedAt: decided ? new Date() : null } : {}),
      ...(landlordNotes !== undefined ? { landlordNotes: landlordNotes || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(applications.id, found.application.id))
    .returning();
  return NextResponse.json({ application });
}
