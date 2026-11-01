import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, licenseInvites } from '@/db/schema';

/** A hard-to-guess token for an invitation link. */
export const newInviteToken = () => randomBytes(24).toString('base64url');

type Invite = typeof licenseInvites.$inferSelect;

/** An invitation that can still be used: not used yet and not revoked. */
export async function openInvite(token: string): Promise<Invite | null> {
  if (!token || token.length > 64) return null;
  const [invite] = await db
    .select()
    .from(licenseInvites)
    .where(and(eq(licenseInvites.token, token), isNull(licenseInvites.usedBy), isNull(licenseInvites.revokedAt)))
    .limit(1);
  return invite ?? null;
}

/**
 * Creates the account for a new login that signed up through an invitation link, with the license
 * on the link, and marks the link used. Both happen in one transaction with the invitation row
 * locked, so a link can't be used twice. An invitation made out to an email only works for that
 * email. Returns null (and creates nothing) when the link is used, revoked, unknown or for someone
 * else.
 */
export async function accountFromInvite(token: string, login: { id: string; email: string; kind: 'homeowner' | 'landlord'; fullName: string | null }) {
  if (!token || token.length > 64) return null;
  const email = login.email.toLowerCase();
  const account = await db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(licenseInvites)
      .where(and(eq(licenseInvites.token, token), isNull(licenseInvites.usedBy), isNull(licenseInvites.revokedAt)))
      .for('update')
      .limit(1);
    if (!invite || (invite.email && invite.email.toLowerCase() !== email)) return null;
    const [created] = await tx
      .insert(accounts)
      .values({ id: login.id, email, role: 'landlord', kind: login.kind, fullName: login.fullName, homeLimit: invite.homeLimit, planExpires: invite.planExpires, planPaid: invite.paid })
      .onConflictDoNothing()
      .returning();
    if (!created) return null;
    await tx.update(licenseInvites).set({ usedBy: created.id, usedAt: new Date() }).where(eq(licenseInvites.id, invite.id));
    return created;
  });
  return account ?? (await db.select().from(accounts).where(eq(accounts.id, login.id)).limit(1))[0] ?? null;
}
