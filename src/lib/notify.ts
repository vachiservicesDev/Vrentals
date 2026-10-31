import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, notifications } from '@/db/schema';

type Notice = { title: string; message: string; urgent?: boolean; link?: string };

/** An in-app notification for one account (shown under the bell and on /notifications). */
export async function notify(input: Notice & { accountId: string }) {
  await db.insert(notifications).values({ ...input, urgent: input.urgent ?? false });
}

/** The same notification for a home's owner and each of their active co-landlords. */
export async function notifyLandlords(ownerId: string, input: Notice) {
  const team = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(or(eq(accounts.id, ownerId), eq(accounts.actsFor, ownerId)), eq(accounts.isActive, true)));
  if (team.length) await db.insert(notifications).values(team.map((a) => ({ ...input, accountId: a.id, urgent: input.urgent ?? false })));
}
