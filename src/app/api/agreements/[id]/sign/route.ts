import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { leaseAgreements } from '@/db/schema';
import { requireAccount, requireLandlord } from '@/lib/auth/guards';
import { notify, notifyLandlords } from '@/lib/notify';
import { agreementFor } from '@/lib/rentals/agreements';
import { sameName, signSchema } from '@/lib/rentals/leasing';
import { sha256 } from '@/lib/rentals/leaseTemplate';
import { clientIp } from '@/lib/rentals/listings';

/**
 * Signs the written lease electronically: the landlord first (which sends it to the tenant), then the
 * tenant. Each signature records the typed name, the time and the IP address, and only goes through
 * if the text still matches the fingerprint taken when it was prepared.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const found = await agreementFor(gate.account, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const body = signSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const { agreement: a, lease, property, as } = found;
  if (sha256(a.body) !== a.bodySha256) return NextResponse.json({ message: 'This lease changed after it was prepared. Prepare it again.' }, { status: 409 });
  const ip = clientIp(request.headers);
  const name = body.data.signedName;

  if (as === 'landlord') {
    if (a.status !== 'draft') return NextResponse.json({ message: 'You already signed this lease.' }, { status: 409 });
    const writer = await requireLandlord('write');
    if (!writer.ok) return NextResponse.json({ message: writer.message }, { status: writer.status });
    const landlordName = (a.terms as { landlordName: string }).landlordName;
    if (!sameName(name, landlordName)) return NextResponse.json({ message: `Type the landlord name as it appears in the lease: ${landlordName}.`, errors: { fieldErrors: { signedName: ['Must match the landlord name in the lease.'] } } }, { status: 400 });
    const [signed] = await db
      .update(leaseAgreements)
      .set({ status: 'sent', landlordName: name, landlordSignedAt: new Date(), landlordSignedIp: ip, updatedAt: new Date() })
      .where(and(eq(leaseAgreements.id, a.id), eq(leaseAgreements.status, 'draft')))
      .returning();
    if (!signed) return NextResponse.json({ message: 'You already signed this lease.' }, { status: 409 });
    if (lease.tenantId) {
      await notify({ accountId: lease.tenantId, title: 'Your lease is ready to sign', message: `Your landlord signed the lease for ${property.name}. Read it and sign when you're ready.`, urgent: true, link: `/agreements/${a.id}` });
    }
    return NextResponse.json({ status: signed.status, tenantHasLogin: !!lease.tenantId });
  }

  if (a.status !== 'sent') return NextResponse.json({ message: a.status === 'signed' ? 'You already signed this lease.' : 'This lease is no longer open for signing.' }, { status: 409 });
  if (!sameName(name, lease.tenantName)) return NextResponse.json({ message: `Type your name as it appears in the lease: ${lease.tenantName}.`, errors: { fieldErrors: { signedName: ['Must match your name in the lease.'] } } }, { status: 400 });
  const [signed] = await db
    .update(leaseAgreements)
    .set({ status: 'signed', tenantName: name, tenantSignedAt: new Date(), tenantSignedIp: ip, updatedAt: new Date() })
    .where(and(eq(leaseAgreements.id, a.id), eq(leaseAgreements.status, 'sent')))
    .returning();
  if (!signed) return NextResponse.json({ message: 'This lease is no longer open for signing.' }, { status: 409 });
  await notifyLandlords(property.ownerId, { title: `Lease signed: ${property.name}`, message: `${lease.tenantName} signed the lease. Both signatures are in, and the signed copy is saved with the home.`, link: `/agreements/${a.id}` });
  return NextResponse.json({ status: signed.status });
}
