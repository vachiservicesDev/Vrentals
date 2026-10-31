import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, leases, properties, rentCharges } from '@/db/schema';
import { sendMail, rentEmail, smtpConfigured } from '@/lib/email/mail';
import { notify } from '@/lib/notify';
import { balanceOf, receiptNumber, receiptText, type ReceiptFacts } from './messages';
import { monthName } from './rent';

type Account = typeof accounts.$inferSelect;

/** A month's rent with its lease, home and landlord, for a receipt or a reminder. */
export async function chargeDetails(chargeId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(chargeId)) return null;
  const [row] = await db
    .select({ charge: rentCharges, lease: leases, property: properties, landlordName: accounts.fullName })
    .from(rentCharges)
    .innerJoin(leases, eq(leases.id, rentCharges.leaseId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .innerJoin(accounts, eq(accounts.id, properties.ownerId))
    .where(eq(rentCharges.id, chargeId))
    .limit(1);
  return row ?? null;
}

type Details = NonNullable<Awaited<ReturnType<typeof chargeDetails>>>;

export function receiptFacts(d: Details): ReceiptFacts {
  return {
    tenantName: d.lease.tenantName,
    landlordName: d.landlordName,
    home: d.property.name,
    period: d.charge.period,
    amount: d.charge.amount,
    paidAmount: d.charge.paidAmount,
    paidOn: d.charge.paidOn,
    paymentMethod: d.charge.paymentMethod,
  };
}

/**
 * The receipt for one month, for the landlord who owns the home (`ownerId`) or the tenant on its
 * lease. Anyone else gets null, so the route answers 404 and doesn't confirm the receipt exists.
 */
export async function receiptFor(account: Account, ownerId: string | null, chargeId: string) {
  const d = await chargeDetails(chargeId);
  if (!d) return null;
  const allowed = account.role === 'landlord' ? d.property.ownerId === ownerId : d.lease.tenantId === account.id;
  if (!allowed || Number(d.charge.paidAmount) <= 0) return null;
  const p = d.property;
  return {
    number: receiptNumber(d.charge.id, d.charge.period),
    period: d.charge.period,
    dueDate: d.charge.dueDate,
    rent: d.charge.amount,
    paid: d.charge.paidAmount,
    balance: balanceOf(d.charge).toFixed(2),
    paidOn: d.charge.paidOn,
    paymentMethod: d.charge.paymentMethod,
    tenant: { name: d.lease.tenantName, email: d.lease.tenantEmail, phone: d.lease.tenantPhone },
    home: { name: p.name, address: [p.address, p.city, `${p.state} ${p.zip ?? ''}`.trim()].filter(Boolean).join(', ') },
    landlord: { name: d.landlordName },
    text: receiptText(receiptFacts(d)),
  };
}

export const receiptPath = (chargeId: string) => `/receipts/${chargeId}`;

/**
 * Tells the tenant a payment was recorded: always in the app, and by email too when the app's email
 * account is set up. An email failure never undoes the payment; it's reported back instead.
 */
export async function sendReceipt(d: Details, appUrl: string): Promise<{ emailed: boolean; emailError?: string }> {
  const url = `${appUrl.replace(/\/+$/, '')}${receiptPath(d.charge.id)}`;
  const facts = receiptFacts(d);
  const message = receiptText(facts);
  if (d.lease.tenantId) {
    await notify({ accountId: d.lease.tenantId, title: `Rent received for ${monthName(d.charge.period)}`, message, link: receiptPath(d.charge.id) });
  }
  if (!smtpConfigured()) return { emailed: false };
  try {
    const subject = `Rent receipt: ${monthName(d.charge.period)}, ${d.property.name}`;
    await sendMail(d.lease.tenantEmail, rentEmail(subject, 'Rent received', message, url, 'View receipt'));
    return { emailed: true };
  } catch (e) {
    return { emailed: false, emailError: e instanceof Error ? e.message : 'Email failed' };
  }
}
