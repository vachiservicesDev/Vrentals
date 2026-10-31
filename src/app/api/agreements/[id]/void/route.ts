import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { leaseAgreements } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { notify } from '@/lib/notify';
import { agreementFor } from '@/lib/rentals/agreements';

/** The landlord cancels a written lease (to fix a mistake, say). It's kept for the record, marked void. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const found = await agreementFor(gate.account, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const [voided] = await db
    .update(leaseAgreements)
    .set({ status: 'void', updatedAt: new Date() })
    .where(and(eq(leaseAgreements.id, found.agreement.id), ne(leaseAgreements.status, 'void')))
    .returning();
  if (!voided) return NextResponse.json({ message: 'Already void.' }, { status: 409 });
  if (found.lease.tenantId && found.agreement.status !== 'draft') {
    await notify({ accountId: found.lease.tenantId, title: 'Lease withdrawn', message: `Your landlord withdrew the written lease for ${found.property.name}. They'll send a corrected one.`, link: '/home' });
  }
  return NextResponse.json({ ok: true });
}
