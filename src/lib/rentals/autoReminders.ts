import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, leases, properties, rentCharges } from '@/db/schema';
import { addDays } from '@/lib/dates';
import { rentEmail, sendMail, smtpConfigured } from '@/lib/email/mail';
import { notify, notifyLandlords } from '@/lib/notify';
import { reminderText } from './messages';
import { chargeStatus, dueDateFor, graceEnds, leaseCoversPeriod, monthName, periodStart } from './rent';

/** Rent is added this many days before it's due, so the tenant can see it coming. */
export const ADD_RENT_DAYS = 5;
/** The friendly reminder goes out this many days before the due date. */
export const REMIND_DAYS = 3;
/** A late notice is only sent for rent that became late within this many days (not years-old history). */
const LATE_WINDOW_DAYS = 30;

export interface ReminderRun {
  added: number;
  reminded: number;
  lateNotices: number;
  emailErrors: number;
}

/**
 * The daily rent job, safe to run any number of times a day:
 * 1. adds next month's rent for each active lease a few days before it's due (never twice);
 * 2. reminds the tenant 3 days before the due date, in the app and by email when email is set up;
 * 3. once the grace period passes with rent unpaid, tells the tenant and the landlords it's late.
 * Each charge gets at most one reminder and one late notice.
 */
export async function runRentReminders(today: string, appUrl: string): Promise<ReminderRun> {
  const run: ReminderRun = { added: 0, reminded: 0, lateNotices: 0, emailErrors: 0 };
  const active = await db
    .select({ lease: leases, property: properties, landlordName: accounts.fullName })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .innerJoin(accounts, eq(accounts.id, properties.ownerId))
    .where(eq(leases.status, 'active'));
  if (active.length === 0) return run;

  // 1. Upcoming rent: this month's or next month's, when its due date is within the next few days.
  const horizon = addDays(today, ADD_RENT_DAYS);
  const toAdd = active.flatMap(({ lease }) =>
    [periodStart(today), periodStart(addDays(today, 31))]
      .map((period) => ({ period, dueDate: dueDateFor(period, lease.dueDay) }))
      .filter(({ period, dueDate }) => dueDate >= today && dueDate <= horizon && leaseCoversPeriod(lease, period))
      .map(({ period, dueDate }) => ({ leaseId: lease.id, period, dueDate, amount: lease.monthlyRent })),
  );
  if (toAdd.length) {
    const added = await db.insert(rentCharges).values(toAdd).onConflictDoNothing({ target: [rentCharges.leaseId, rentCharges.period] }).returning({ id: rentCharges.id });
    run.added = added.length;
  }

  const byLease = new Map(active.map((a) => [a.lease.id, a]));
  const charges = await db
    .select()
    .from(rentCharges)
    .where(inArray(rentCharges.leaseId, [...byLease.keys()]));
  const email = smtpConfigured();
  const link = `${appUrl.replace(/\/+$/, '')}/home`;

  for (const charge of charges) {
    const { lease, property, landlordName } = byLease.get(charge.leaseId)!;
    const status = chargeStatus(charge, lease.graceDays, today);
    if (status === 'paid') continue;
    const facts = { tenantName: lease.tenantName, landlordName, home: property.name, period: charge.period, dueDate: charge.dueDate, amount: charge.amount, paidAmount: charge.paidAmount };

    // 2. Friendly reminder.
    const remind = !charge.reminderSentAt && charge.dueDate >= today && charge.dueDate <= addDays(today, REMIND_DAYS);
    // 3. Late notice, for rent that went late recently.
    const late = status === 'late' && !charge.lateNoticeSentAt && graceEnds(charge.dueDate, lease.graceDays) >= addDays(today, -LATE_WINDOW_DAYS);
    if (!remind && !late) continue;

    const message = reminderText({ ...facts, late });
    const title = late ? `${monthName(charge.period)} rent is late` : `${monthName(charge.period)} rent is due soon`;
    let delivered = false;
    if (lease.tenantId) {
      await notify({ accountId: lease.tenantId, title, message, urgent: late, link: '/home' });
      delivered = true;
    }
    if (email) {
      try {
        await sendMail(lease.tenantEmail, rentEmail(`${title}: ${property.name}`, title, message, link, 'See my rent'));
        delivered = true;
      } catch (err) {
        console.error('[rent reminders] email failed', err);
        run.emailErrors++;
      }
    }
    if (late) {
      await notifyLandlords(property.ownerId, {
        title: `Rent is late at ${property.name}`,
        message: `${lease.tenantName} hasn't paid ${monthName(charge.period)} rent in full. ${delivered ? 'They were sent a late notice.' : 'They have no login or email to notify, so contact them directly.'}`,
        urgent: true,
        link: `/homes/${property.id}#rent`,
      });
    }
    // Marked even when the tenant couldn't be reached, so nobody gets the same notice twice.
    await db
      .update(rentCharges)
      .set(late ? { lateNoticeSentAt: new Date() } : { reminderSentAt: new Date() })
      .where(and(eq(rentCharges.id, charge.id), late ? isNull(rentCharges.lateNoticeSentAt) : isNull(rentCharges.reminderSentAt)));
    if (late) run.lateNotices++;
    else if (delivered) run.reminded++;
  }
  return run;
}
