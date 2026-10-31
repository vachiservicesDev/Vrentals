import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { repairRequests } from '@/db/schema';
import { requireAccount } from '@/lib/auth/guards';
import { notifyLandlords } from '@/lib/notify';
import { tenantLease } from '@/lib/rentals/access';
import { repairCreateSchema } from '@/lib/rentals/schemas';

/** A tenant reports something that needs fixing in their home; the landlord is notified. */
export async function POST(request: NextRequest) {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const found = await tenantLease(gate.account.id);
  if (!found) return NextResponse.json({ message: "You don't have an active lease in the portal." }, { status: 403 });

  const body = repairCreateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const [repair] = await db
    .insert(repairRequests)
    .values({ ...body.data, propertyId: found.property.id, reportedBy: gate.account.id })
    .returning({ id: repairRequests.id, title: repairRequests.title, urgency: repairRequests.urgency, status: repairRequests.status, createdAt: repairRequests.createdAt });

  await notifyLandlords(found.property.ownerId, {
    title: repair.urgency === 'urgent' ? 'Urgent repair reported' : 'Repair reported',
    message: `${found.lease.tenantName} at ${found.property.name}: "${repair.title}".`,
    urgent: repair.urgency === 'urgent',
    link: `/homes/${found.property.id}`,
  });
  return NextResponse.json({ repair }, { status: 201 });
}
