import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, leases } from '@/db/schema';
import { confirmUrl, sendMail, smtpConfigured, tenantWelcomeEmail } from '@/lib/email/mail';
import { createAdminClient } from '@/lib/supabase/admin';

type Lease = typeof leases.$inferSelect;

export type TenantInviteResult =
  | { ok: true; outcome: 'emailed' | 'link' | 'existing'; link?: string; userId: string }
  | { ok: false; status: number; message: string };

/**
 * A one-time link to /auth/confirm for an email address: an invite for a new login, or a password
 * reset for one that already exists (an earlier invite, another app in the same Supabase project).
 *
 * A reset link for an existing login is only ever emailed to that address, never handed to the
 * landlord: with it, anyone could take over someone else's login (an admin of another app that
 * shares this Supabase project, say). `existing` tells the caller which kind it got.
 */
export async function signInLink(
  email: string,
  fullName: string,
  appUrl: string,
): Promise<{ ok: true; userId: string; link: string; existing: boolean } | { ok: false; status: number; message: string }> {
  const admin = createAdminClient();
  const invited = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name: fullName } } });
  if (!invited.error && invited.data.user) {
    return { ok: true, userId: invited.data.user.id, link: confirmUrl(appUrl, invited.data.properties.hashed_token, 'invite'), existing: false };
  }
  if (invited.error && /already been registered|already registered|exists/i.test(invited.error.message)) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (error || !data.user) return { ok: false, status: 502, message: `Supabase couldn't create a sign-in link: ${error?.message ?? 'no user'}` };
    return { ok: true, userId: data.user.id, link: confirmUrl(appUrl, data.properties.hashed_token, 'recovery'), existing: true };
  }
  return { ok: false, status: 502, message: `Supabase couldn't create the invite: ${invited.error?.message ?? 'no user'}` };
}

/**
 * Gives a lease's tenant a login: a one-time link straight to /auth/confirm, emailed from the
 * app's own SMTP account or handed back for the landlord to text. New logins get a tenant account;
 * an address that already has an account keeps its role and is just linked to the lease, and (unless
 * emailed) signs in with the password it already has.
 */
export async function inviteTenant(lease: Lease, homeName: string, mode: 'email' | 'link', appUrl: string): Promise<TenantInviteResult> {
  if (mode === 'email' && !smtpConfigured()) {
    return { ok: false, status: 503, message: "The app's email account isn't set up yet. Use \"Create invite link\" and text the link instead." };
  }
  const email = lease.tenantEmail.toLowerCase();
  const signIn = await signInLink(email, lease.tenantName, appUrl);
  if (!signIn.ok) return signIn;
  const { userId, link, existing } = signIn;

  if (mode === 'email') {
    try {
      await sendMail(email, tenantWelcomeEmail(lease.tenantName, homeName, link));
    } catch (err) {
      console.error('[tenant invite] email failed', err);
      return { ok: false, status: 502, message: "The email couldn't be sent. Try again, or use \"Create invite link\"." };
    }
  }

  await db.insert(accounts).values({ id: userId, email, role: 'tenant', fullName: lease.tenantName, phone: lease.tenantPhone }).onConflictDoNothing();
  await db.update(leases).set({ tenantId: userId, updatedAt: new Date() }).where(eq(leases.id, lease.id));
  if (mode === 'email') return { ok: true, outcome: 'emailed', userId };
  return existing ? { ok: true, outcome: 'existing', userId } : { ok: true, outcome: 'link', link, userId };
}
