import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pricePlans } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';
import { priceSchema, priceValues } from '@/lib/rentals/priceSchema';

/** Changes a price plan. New prices apply to new payments; past payments keep what they paid. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const body = priceSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const [plan] = await db.update(pricePlans).set(priceValues(body.data)).where(eq(pricePlans.id, params.id)).returning();
  if (!plan) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json({ plan });
}
