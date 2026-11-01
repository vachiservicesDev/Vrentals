import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, notifications } from '@/db/schema';
import { noticeEmail, sendMail, smtpConfigured } from '@/lib/email/mail';

/**
 * `email: false` skips the email copy, for the few notices that already send their own email
 * (a rent receipt, a rent reminder, a payment confirmation).
 */
type Notice = { title: string; message: string; urgent?: boolean; link?: string; email?: false };

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://vrentals.vercel.app').replace(/\/+$/, '');
}

/** Emails each person a copy of the notice, unless they turned emails off. A failed send never blocks the app. */
async function emailCopies(accountIds: string[], notice: Notice): Promise<void> {
  if (notice.email === false || !accountIds.length || !smtpConfigured()) return;
  const people = await db
    .select({ email: accounts.email, fullName: accounts.fullName })
    .from(accounts)
    .where(and(inArray(accounts.id, accountIds), eq(accounts.isActive, true), eq(accounts.emailNotifications, true)));
  const url = `${appUrl()}${notice.link?.startsWith('/') ? notice.link : '/notifications'}`;
  await Promise.allSettled(people.map((p) => sendMail(p.email, noticeEmail(p.fullName ?? '', notice.title, notice.message, url))));
}

const row = ({ email: _email, ...n }: Notice) => ({ ...n, urgent: n.urgent ?? false });

/** An in-app notification for one account (shown under the bell and on /notifications), and its email copy. */
export async function notify(input: Notice & { accountId: string }) {
  await db.insert(notifications).values({ ...row(input), accountId: input.accountId });
  await emailCopies([input.accountId], input);
}

/** The same notification for a home's owner and each of their active co-landlords, with email copies. */
export async function notifyLandlords(ownerId: string, input: Notice) {
  const team = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(or(eq(accounts.id, ownerId), eq(accounts.actsFor, ownerId)), eq(accounts.isActive, true)));
  if (!team.length) return;
  await db.insert(notifications).values(team.map((a) => ({ ...row(input), accountId: a.id })));
  await emailCopies(
    team.map((a) => a.id),
    input,
  );
}
