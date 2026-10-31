import { cache } from 'react';
import { redirect } from 'next/navigation';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, notifications, platformAdmins } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';
import { accountFor } from './guards';

export type AppSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

/** The signed-in user, their Rentals account (when they have one) and unread notifications. Cached per request. */
export const loadSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const account = await accountFor(user);
  let unread = 0;
  let platformAdmin = false;
  if (account) {
    const [[row], [admin]] = await Promise.all([
      db
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.accountId, account.id), isNull(notifications.readAt))),
      db.select({ id: platformAdmins.accountId }).from(platformAdmins).where(eq(platformAdmins.accountId, account.id)).limit(1),
    ]);
    unread = Number(row?.n ?? 0);
    platformAdmin = !!admin;
  }
  const email = (account?.email ?? user.email ?? '').toLowerCase();
  return { user, account, email, displayName: account?.fullName || email.split('@')[0], unread, platformAdmin };
});

/** For pages: the session, or a redirect to sign-in. */
export async function requireSession() {
  const session = await loadSession();
  if (!session) redirect('/login');
  return session;
}

/** Where a signed-in user lands. */
export function homeFor(role: string | null | undefined) {
  return role === 'tenant' ? '/home' : '/dashboard';
}

export type Account = typeof accounts.$inferSelect;
