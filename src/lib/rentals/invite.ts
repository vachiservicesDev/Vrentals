import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, leases } from '@/db/schema';
import { confirmUrl, sendMail, smtpConfigured, tenantWelcomeEmail } from '@/lib/email/mail';
import { createAdminClient } from '@/lib/supabase/admin';

type Lease = typeof leases.$inferSelect;

export type TenantInviteResult =
  | { ok: true; outcome: 'emailed' | 'link'; link?: string; userId: string }
  | { ok: false; status: number; message: string };

/**
 * Gives a lease's tenant a login: a one-time link straight to /auth/confirm, emailed from the
 * app's own SMTP account or handed back for the landlord to text. New logins get a tenant account;
 * an address that already has an account keeps its role and is just linked to the lease.
 */
export async function inviteTenant(lease: Lease, homeName: string, mode: 'email' | 'link', appUrl: string): Promise<TenantInviteResult> {
  if (mode === 'email' && !smtpConfigured()) {
    return { ok: false, status: 503, message: "The app's email account isn't set up yet. Use \"Create invite link\" and text the link instead." };
  }
  const email = lease.tenantEmail.toLowerCase();
  const admin = createAdminClient();

  let userId: string;
  let link: string;
  const invited = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name: lease.tenantName } } });
  if (!invited.error && invited.data.user) {
    userId = invited.data.user.id;
    link = confirmUrl(appUrl, invited.data.properties.hashed_token, 'invite');
  } else if (invited.error && /already been registered|already registered|exists/i.test(invited.error.message)) {
    // Already has a login (an earlier invite, or the same person on another lease): a reset link.
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (error || !data.user) return { ok: false, status: 502, message: `Supabase couldn't create a sign-in link: ${error?.message ?? 'no user'}` };
    userId = data.user.id;
    link = confirmUrl(appUrl, data.properties.hashed_token, 'recovery');
  } else {
    return { ok: false, status: 502, message: `Supabase couldn't create the invite: ${invited.error?.message ?? 'no user'}` };
  }

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
  return mode === 'email' ? { ok: true, outcome: 'emailed', userId } : { ok: true, outcome: 'link', link, userId };
}
