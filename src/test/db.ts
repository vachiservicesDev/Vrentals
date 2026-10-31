import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { accounts } from '@/db/schema';

const TABLES = ['notifications', 'rent_charges', 'repair_requests', 'reminders', 'leases', 'properties', 'accounts'];

/** Wipes every app table between tests. Guarded by setup.ts's DATABASE_URL check. */
export async function resetDb(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.map((t) => `rentals."${t}"`).join(', ')} RESTART IDENTITY CASCADE`));
}

/** An account standing in for a Supabase login (there's no auth.users locally). */
export async function seedAccount(opts: { role?: 'landlord' | 'tenant'; email?: string; fullName?: string; isActive?: boolean } = {}) {
  const id = randomUUID();
  const [account] = await db
    .insert(accounts)
    .values({ id, email: opts.email ?? `${id}@test.local`, role: opts.role ?? 'landlord', fullName: opts.fullName ?? null, isActive: opts.isActive ?? true })
    .returning();
  return account;
}
