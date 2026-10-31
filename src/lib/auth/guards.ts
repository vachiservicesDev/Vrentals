import { eq } from 'drizzle-orm';
import type { User } from '@supabase/supabase-js';
import { db } from '@/db';
import { accounts, platformAdmins } from '@/db/schema';
import { LAPSED_MESSAGE, planLapsed, trialPlan } from '@/lib/rentals/plans';
import { createClient } from '@/lib/supabase/server';

/**
 * The Vrentals account for a Supabase login. A landlord who signed up here gets theirs created on
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
    .values({ id: user.id, email: user.email.toLowerCase(), role: 'landlord', fullName: user.user_metadata?.full_name || null, ...trialPlan() })
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
  if (!account || !account.isActive) return { ok: false as const, status: 403, message: 'No Vrentals account for this login' };
  return { ok: true as const, user, account };
}

/** API gate: any active account (landlord or tenant). */
export async function requireAccount() {
  return current();
}

/** Whose homes a landlord account manages: its own, or for a co-landlord, the owner's. */
export function ownerIdOf(account: { id: string; actsFor: string | null }): string {
  return account.actsFor ?? account.id;
}

/**
 * API gate: landlords only. `gate.ownerId` is what every landlord query scopes by; a co-landlord
 * gets the owner's id there, so they see and change exactly what the owner can. `gate.owner` holds
 * the plan. Pass 'write' on any route that changes something: a lapsed plan is read-only.
 */
export async function requireLandlord(mode: 'read' | 'write' = 'read') {
  const gate = await current();
  if (!gate.ok) return gate;
  if (gate.account.role !== 'landlord') return { ok: false as const, status: 403, message: 'Landlord access required' };
  const ownerId = ownerIdOf(gate.account);
  const owner = ownerId === gate.account.id ? gate.account : (await db.select().from(accounts).where(eq(accounts.id, ownerId)).limit(1))[0];
  if (!owner?.isActive) return { ok: false as const, status: 403, message: 'This Vrentals account is suspended.' };
  if (mode === 'write' && planLapsed(owner)) return { ok: false as const, status: 403, message: LAPSED_MESSAGE };
  return { ...gate, ownerId, owner };
}

/** API gate: the owner of the homes only (not a co-landlord). For managing who else has access. */
export async function requireOwner() {
  const gate = await requireLandlord('write');
  if (!gate.ok) return gate;
  if (gate.account.actsFor) return { ok: false as const, status: 403, message: 'Only the owner of these homes can do that' };
  return gate;
}

/** API gate: Vachi staff, for /platform. */
export async function requirePlatformAdmin() {
  const gate = await current();
  if (!gate.ok) return gate;
  const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.accountId, gate.account.id)).limit(1);
  if (!row) return { ok: false as const, status: 404, message: 'Not found' };
  return gate;
}
