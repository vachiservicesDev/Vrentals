import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { leaseAgreements } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { ownedLease } from '@/lib/rentals/access';
import { agreementTermsSchema } from '@/lib/rentals/leasing';
import { renderLease, sha256 } from '@/lib/rentals/leaseTemplate';

/**
 * Prepares the written lease from the lease's terms and the landlord's extra terms. While it's still
 * a draft it can be prepared again; once the landlord signs, it's fixed (void it to start over).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const found = await ownedLease(gate.ownerId, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  if (found.lease.status !== 'active') return NextResponse.json({ message: 'This lease has ended.' }, { status: 409 });

  const body = agreementTermsSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const { lease, property: p } = found;
  const text = renderLease(
    {
      tenantName: lease.tenantName,
      tenantEmail: lease.tenantEmail,
      state: p.state,
      homeName: p.name,
      homeAddress: [p.address, p.city, `${p.state} ${p.zip ?? ''}`.trim()].filter(Boolean).join(', '),
      startDate: lease.startDate,
      endDate: lease.endDate,
      monthlyRent: lease.monthlyRent,
      dueDay: lease.dueDay,
      graceDays: lease.graceDays,
      lateFee: lease.lateFee,
      securityDeposit: lease.securityDeposit,
    },
    body.data,
  );
  const values = { terms: body.data, body: text, bodySha256: sha256(text), updatedAt: new Date() };

  const [live] = await db
    .select()
    .from(leaseAgreements)
    .where(and(eq(leaseAgreements.leaseId, lease.id), ne(leaseAgreements.status, 'void')))
    .limit(1);
  if (live && live.status !== 'draft') return NextResponse.json({ message: 'This lease is already signed by you. Void it to prepare a new one.' }, { status: 409 });
  const [agreement] = live
    ? await db.update(leaseAgreements).set(values).where(eq(leaseAgreements.id, live.id)).returning()
    : await db.insert(leaseAgreements).values({ leaseId: lease.id, ...values }).returning();
  return NextResponse.json({ agreement }, { status: live ? 200 : 201 });
}
