import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/auth/guards';
import { agreementFor } from '@/lib/rentals/agreements';

/** A written lease, for the home's landlords or (once sent) its tenant. Sign-in IPs stay landlord-only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const found = await agreementFor(gate.account, params.id);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const { agreement: a, lease, property, as } = found;
  return NextResponse.json({
    as,
    agreement: {
      id: a.id,
      status: a.status,
      terms: as === 'landlord' ? a.terms : undefined,
      body: a.body,
      bodySha256: a.bodySha256,
      landlordName: a.landlordName,
      landlordSignedAt: a.landlordSignedAt,
      tenantName: a.tenantName,
      tenantSignedAt: a.tenantSignedAt,
      ...(as === 'landlord' ? { landlordSignedIp: a.landlordSignedIp, tenantSignedIp: a.tenantSignedIp } : {}),
    },
    lease: { id: lease.id, tenantName: lease.tenantName, startDate: lease.startDate, endDate: lease.endDate },
    home: { id: property.id, name: property.name },
  });
}
