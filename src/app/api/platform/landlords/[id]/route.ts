import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';

const planSchema = z.object({
  homeLimit: z.union([z.literal(''), z.coerce.number().int('Use a whole number.').min(0).max(10000)]).optional(),
  planExpires: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date.')]).optional(),
  isActive: z.boolean().optional(),
});

/** Sets a landlord's plan: home limit, end date (empty for none) and whether the account is suspended. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (params.id === gate.account.id) return NextResponse.json({ message: "You can't change your own plan here." }, { status: 409 });

  const body = planSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const { homeLimit, planExpires, isActive } = body.data;

  const [landlord] = await db
    .update(accounts)
    .set({
      ...(homeLimit !== undefined ? { homeLimit: homeLimit === '' ? null : homeLimit } : {}),
      ...(planExpires !== undefined ? { planExpires: planExpires || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, params.id), eq(accounts.role, 'landlord'), isNull(accounts.actsFor)))
    .returning({ id: accounts.id, homeLimit: accounts.homeLimit, planExpires: accounts.planExpires, isActive: accounts.isActive });
  if (!landlord) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json({ landlord });
}
