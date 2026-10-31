import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, properties } from '@/db/schema';
import { coLandlordEmail, sendMail, smtpConfigured } from '@/lib/email/mail';
import { signInLink } from './invite';

type Account = typeof accounts.$inferSelect;

export type CoLandlordResult =
  | { ok: true; outcome: 'emailed' | 'link' | 'existing'; link?: string; account: Account }
  | { ok: false; status: number; message: string };

/** The owner's co-landlords, oldest first. */
export async function coLandlords(ownerId: string) {
  return db
    .select({ id: accounts.id, email: accounts.email, fullName: accounts.fullName, phone: accounts.phone, createdAt: accounts.createdAt })
    .from(accounts)
    .where(eq(accounts.actsFor, ownerId))
    .orderBy(asc(accounts.createdAt));
}

/**
 * Adds a co-landlord: someone who manages all of `owner`'s homes with the same access. They get a
 * login like a tenant does (an emailed invite, or a link the owner texts). An address that already
 * has a Rentals account can't be added: a tenant, another landlord, or someone else's co-landlord
 * would otherwise mix two people's homes in one account.
 */
export async function addCoLandlord(owner: Account, input: { email: string; fullName: string }, mode: 'email' | 'link', appUrl: string): Promise<CoLandlordResult> {
  if (mode === 'email' && !smtpConfigured()) {
    return { ok: false, status: 503, message: "The app's email account isn't set up yet. Use \"Create invite link\" and text the link instead." };
  }
  const email = input.email.toLowerCase();
  if (email === owner.email.toLowerCase()) return { ok: false, status: 409, message: "That's your own email." };

  const signIn = await signInLink(email, input.fullName, appUrl);
  if (!signIn.ok) return signIn;

  const [current] = await db.select().from(accounts).where(eq(accounts.id, signIn.userId)).limit(1);
  if (current?.actsFor === owner.id) return { ok: false, status: 409, message: `${email} is already a co-landlord.` };
  if (current) {
    const [{ n }] = await db.select({ n: count() }).from(properties).where(eq(properties.ownerId, current.id));
    // Only an empty landlord account (signed up, never added a home) can join someone else's.
    if (current.role !== 'landlord' || current.actsFor || Number(n) > 0) {
      return { ok: false, status: 409, message: `${email} already uses Rentals with its own homes or lease, so it can't be added. Ask them for a different email.` };
    }
  }

  if (mode === 'email') {
    try {
      await sendMail(email, coLandlordEmail(input.fullName, owner.fullName || owner.email, signIn.link));
    } catch (err) {
      console.error('[co-landlord invite] email failed', err);
      return { ok: false, status: 502, message: "The email couldn't be sent. Try again, or use \"Create invite link\"." };
    }
  }

  const [account] = current
    ? await db.update(accounts).set({ actsFor: owner.id, updatedAt: new Date() }).where(eq(accounts.id, current.id)).returning()
    : await db.insert(accounts).values({ id: signIn.userId, email, role: 'landlord', fullName: input.fullName, actsFor: owner.id }).returning();

  if (mode === 'email') return { ok: true, outcome: 'emailed', account };
  // A reset link for a login that already existed is only ever emailed (see signInLink).
  return signIn.existing ? { ok: true, outcome: 'existing', account } : { ok: true, outcome: 'link', link: signIn.link, account };
}

/** Ends a co-landlord's access. Their login stays (it may be used by other apps); their Rentals account goes. */
export async function removeCoLandlord(ownerId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const removed = await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.actsFor, ownerId))).returning({ id: accounts.id });
  return removed.length > 0;
}
