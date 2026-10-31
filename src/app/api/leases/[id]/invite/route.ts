import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedLease } from '@/lib/rentals/access';
import { inviteTenant } from '@/lib/rentals/invite';

const inviteSchema = z.object({ mode: z.enum(['email', 'link']).default('link') });

/** Gives the tenant on a lease a portal login: an emailed invite, or a link the landlord texts them. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const found = await ownedLease(gate.account.id, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (found.lease.status !== 'active') return NextResponse.json({ message: 'This lease has ended.' }, { status: 409 });

  const body = inviteSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const result = await inviteTenant(found.lease, found.property.name, body.data.mode, appUrl);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });

  return NextResponse.json({ outcome: result.outcome, link: result.link ?? null });
}
