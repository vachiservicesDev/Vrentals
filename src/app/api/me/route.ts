import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, rentCharges, repairRequests } from '@/db/schema';
import { requireAccount } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { tenantLease } from '@/lib/rentals/access';
import { ownerTakesPayments, pendingPayments } from '@/lib/rentals/payments';
import { chargeStatus } from '@/lib/rentals/rent';

/**
 * The signed-in tenant's home, lease terms, rent history and repairs. Landlord-only fields
 * (repair notes and costs, other leases, reminders) are never included.
 */
export async function GET() {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const found = await tenantLease(gate.account.id);
  if (!found) return NextResponse.json({ rental: null });
  const { lease, property } = found;

  const [charges, repairs, [landlord]] = await Promise.all([
    db.select().from(rentCharges).where(eq(rentCharges.leaseId, lease.id)).orderBy(desc(rentCharges.period)),
    db
      .select({
        id: repairRequests.id,
        title: repairRequests.title,
        description: repairRequests.description,
        urgency: repairRequests.urgency,
        status: repairRequests.status,
        appointmentAt: repairRequests.appointmentAt,
        vendorName: repairRequests.vendorName,
        createdAt: repairRequests.createdAt,
        completedAt: repairRequests.completedAt,
      })
      .from(repairRequests)
      .where(eq(repairRequests.propertyId, property.id))
      .orderBy(desc(repairRequests.createdAt)),
    db.select({ fullName: accounts.fullName, email: accounts.email, phone: accounts.phone }).from(accounts).where(eq(accounts.id, property.ownerId)).limit(1),
  ]);

  const [payee, pending] = await Promise.all([ownerTakesPayments(property.ownerId), pendingPayments(charges.map((c) => c.id))]);
  const processing = new Map(pending.map((p) => [p.chargeId, p.amount]));
  const today = todayEastern();
  const since = new Date(`${lease.startDate}T00:00:00Z`);
  return NextResponse.json({
    rental: {
      home: { name: property.name, address: property.address, city: property.city, state: property.state, zip: property.zip },
      lease: {
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: lease.monthlyRent,
        dueDay: lease.dueDay,
        graceDays: lease.graceDays,
        lateFee: lease.lateFee,
        securityDeposit: lease.securityDeposit,
      },
      landlord: landlord ? { name: landlord.fullName, email: landlord.email, phone: landlord.phone } : null,
      charges: charges.map((c) => ({
        id: c.id,
        period: c.period,
        dueDate: c.dueDate,
        amount: c.amount,
        paidAmount: c.paidAmount,
        paidOn: c.paidOn,
        status: chargeStatus(c, lease.graceDays, today),
        processing: processing.get(c.id) ?? null,
      })),
      // The landlord's Stripe account is connected, so a bank payment can be made here.
      onlinePayments: !!payee,
      // Repairs from before this lease began belong to an earlier tenant.
      repairs: repairs.filter((r) => r.createdAt >= since),
    },
  });
}
