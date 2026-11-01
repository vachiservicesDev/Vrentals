import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, licenseInvites } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';
import { newInviteToken } from '@/lib/rentals/licenses';

const inviteSchema = z.object({
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a full email address.').max(320)]).optional(),
  kind: z.enum(['landlord', 'homeowner']),
  homeLimit: z.union([z.literal(''), z.coerce.number().int('Use a whole number.').min(0).max(10000)]).optional(),
  planExpires: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date.')]).optional(),
  paid: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Every invitation link, newest first, with who used it. Vachi staff only. */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const rows = await db
    .select({
      id: licenseInvites.id,
      token: licenseInvites.token,
      email: licenseInvites.email,
      kind: licenseInvites.kind,
      homeLimit: licenseInvites.homeLimit,
      planExpires: licenseInvites.planExpires,
      paid: licenseInvites.paid,
      note: licenseInvites.note,
      usedAt: licenseInvites.usedAt,
      revokedAt: licenseInvites.revokedAt,
      createdAt: licenseInvites.createdAt,
      usedByEmail: accounts.email,
    })
    .from(licenseInvites)
    .leftJoin(accounts, eq(accounts.id, licenseInvites.usedBy))
    .orderBy(desc(licenseInvites.createdAt));
  return NextResponse.json({ invites: rows });
}

/** Makes an invitation link that carries a license: homes allowed, end date and paid or not. */
export async function POST(request: NextRequest) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const body = inviteSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const d = body.data;
  const [invite] = await db
    .insert(licenseInvites)
    .values({
      token: newInviteToken(),
      email: d.email || null,
      kind: d.kind,
      homeLimit: d.homeLimit === '' || d.homeLimit === undefined ? null : d.homeLimit,
      planExpires: d.planExpires || null,
      paid: d.paid ?? false,
      note: d.note || null,
      createdBy: gate.account.id,
    })
    .returning();
  return NextResponse.json({ invite }, { status: 201 });
}
