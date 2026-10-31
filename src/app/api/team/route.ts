import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { requireLandlord, requireOwner } from '@/lib/auth/guards';
import { addCoLandlord, coLandlords } from '@/lib/rentals/team';

const addSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter their name.').max(200),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(255),
  mode: z.enum(['email', 'link']).default('link'),
});

/** Who manages these homes: the owner and their co-landlords. Any of them can look. */
export async function GET() {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const [[owner], team] = await Promise.all([
    db.select({ id: accounts.id, email: accounts.email, fullName: accounts.fullName }).from(accounts).where(eq(accounts.id, gate.ownerId)).limit(1),
    coLandlords(gate.ownerId),
  ]);
  return NextResponse.json({ owner, coLandlords: team, isOwner: !gate.account.actsFor });
}

/** The owner adds a co-landlord. */
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const body = addSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const { mode, ...input } = body.data;
  const result = await addCoLandlord(gate.account, input, mode, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ outcome: result.outcome, link: result.link ?? null, coLandlord: { id: result.account.id, email: result.account.email } }, { status: 201 });
}
