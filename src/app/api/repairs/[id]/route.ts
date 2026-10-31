import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { leases, properties, repairRequests } from '@/db/schema';
import { requireLandlord } from '@/lib/auth/guards';
import { notify } from '@/lib/notify';
import { syncRepairExpense } from '@/lib/rentals/ledger';
import { dec, repairUpdateSchema } from '@/lib/rentals/schemas';
import { stateTimeZone } from '@/lib/rentals/states';

/** The visit time on the home's own clock, like "Tuesday, November 3, 2:00 PM CST". */
const visitTime = (iso: Date, state: string) =>
  iso.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: stateTimeZone(state), timeZoneName: 'short' });

/**
 * Schedules, updates or closes a repair. Setting a visit time moves an open repair to
 * "scheduled", and the tenant is told about the visit and when the repair is marked done.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireLandlord('write');
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const [found] = await db
    .select({ repair: repairRequests, state: properties.state })
    .from(repairRequests)
    .innerJoin(properties, eq(properties.id, repairRequests.propertyId))
    .where(and(eq(repairRequests.id, params.id), eq(properties.ownerId, gate.ownerId)))
    .limit(1);
  if (!found) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const before = found.repair;

  const body = repairUpdateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });

  const d = body.data;
  const appointmentAt = d.appointmentAt === undefined ? undefined : d.appointmentAt ? new Date(d.appointmentAt) : null;
  let status = d.status ?? before.status;
  if (appointmentAt && status === 'open') status = 'scheduled';

  const [repair] = await db
    .update(repairRequests)
    .set({
      status,
      ...(appointmentAt !== undefined ? { appointmentAt } : {}),
      ...(d.vendorName !== undefined ? { vendorName: d.vendorName || null } : {}),
      ...(d.vendorPhone !== undefined ? { vendorPhone: d.vendorPhone || null } : {}),
      ...(d.cost !== undefined ? { cost: d.cost === '' ? null : dec(d.cost) } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      completedAt: status === 'done' ? (before.completedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(repairRequests.id, before.id))
    .returning();

  await syncRepairExpense(repair);

  // The tenant on the home's current lease hears about a new visit time and the finished repair.
  const [lease] = await db
    .select({ tenantId: leases.tenantId })
    .from(leases)
    .where(and(eq(leases.propertyId, repair.propertyId), eq(leases.status, 'active')))
    .orderBy(desc(leases.startDate))
    .limit(1);
  const tenant = lease?.tenantId;
  if (tenant) {
    const newVisit = repair.appointmentAt && repair.appointmentAt.getTime() !== before.appointmentAt?.getTime();
    if (newVisit && repair.status === 'scheduled') {
      await notify({
        accountId: tenant,
        title: 'Repair visit scheduled',
        message: `"${repair.title}": a visit is set for ${visitTime(repair.appointmentAt!, found.state)}${repair.vendorName ? ` with ${repair.vendorName}` : ''}.`,
        link: '/home',
      });
    }
    if (repair.status === 'done' && before.status !== 'done') {
      await notify({
        accountId: tenant,
        title: 'Repair marked done',
        message: `"${repair.title}" is marked as fixed. If it isn't, report it again or message your landlord.`,
        link: '/home',
      });
    }
  }
  return NextResponse.json({ repair });
}
