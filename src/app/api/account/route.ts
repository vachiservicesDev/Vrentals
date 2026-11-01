import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { requireAccount } from '@/lib/auth/guards';

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name.').max(200),
  // An empty string clears it.
  phone: z.string().trim().max(30, 'Keep this under 30 characters.').optional(),
  kind: z.enum(['landlord', 'homeowner']).optional(),
  emailNotifications: z.boolean().optional(),
});

/** Your own name, phone and whether notifications are also emailed. A landlord's are shown to their tenants as the contact. */
export async function PATCH(request: NextRequest) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const [account] = await db
    .update(accounts)
    .set({ fullName: body.data.fullName, ...(body.data.phone !== undefined ? { phone: body.data.phone || null } : {}),
      // Only a landlord account that owns its homes picks what it's for; tenants and co-landlords can't.
      ...(body.data.kind && gate.account.role === 'landlord' && !gate.account.actsFor ? { kind: body.data.kind } : {}),
      ...(body.data.emailNotifications !== undefined ? { emailNotifications: body.data.emailNotifications } : {}),
      updatedAt: new Date() })
    .where(eq(accounts.id, gate.account.id))
    .returning();
  return NextResponse.json({ account });
}
