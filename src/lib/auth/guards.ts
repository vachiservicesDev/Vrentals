import { eq } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

/**
 * The Rentals account for a Supabase login. A landlord who signed up here gets theirs created on
 * first use (the sign-up form tags the login with signup_role "landlord"); tenants get theirs when
 * their landlord invites them. Any other login in the same Supabase project (for example someone
 * from another app) has no account and no access.
 */
export async function accountFor(user: Pick<User, 'id' | 'email' | 'user_metadata'>) {
  const [existing] = await db.select().from(accounts).where(eq(accounts.id, user.id)).limit(1);
  if (existing) return existing;
  if (user.user_metadata?.signup_role !== 'landlord' || !user.email) return null;
  const [created] = await db
    .insert(accounts)
    .values({ id: user.id, email: user.email.toLowerCase(), role: 'landlord', fullName: user.user_metadata?.full_name || null })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.select().from(accounts).where(eq(accounts.id, user.id)).limit(1))[0] ?? null;
}

async function current() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, message: 'Not signed in' };
  const account = await accountFor(user);
  if (!account || !account.isActive) return { ok: false as const, status: 403, message: 'No Rentals account for this login' };
  return { ok: true as const, user, account };
}

/** API gate: any active account (landlord or tenant). */
export async function requireAccount() {
  return current();
}

/** API gate: landlords only. `gate.account.id` is what every landlord query scopes by. */
export async function requireLandlord() {
  const gate = await current();
  if (!gate.ok) return gate;
  if (gate.account.role !== 'landlord') return { ok: false as const, status: 403, message: 'Landlord access required' };
  return gate;
}
