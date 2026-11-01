import { NextResponse } from 'next/server';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { accounts, properties } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';

/** Every landlord and homeowner account (not co-landlords), with their plan and how much of it they use. Vachi staff only. */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const [owners, homes, team] = await Promise.all([
    db
      .select({ id: accounts.id, email: accounts.email, fullName: accounts.fullName, homeLimit: accounts.homeLimit, planExpires: accounts.planExpires, planPaid: accounts.planPaid, kind: accounts.kind, isActive: accounts.isActive, createdAt: accounts.createdAt })
      .from(accounts)
      .where(and(eq(accounts.role, 'landlord'), isNull(accounts.actsFor)))
      .orderBy(asc(accounts.email)),
    db.select({ ownerId: properties.ownerId, n: count() }).from(properties).groupBy(properties.ownerId),
    db.select({ ownerId: accounts.actsFor, n: count() }).from(accounts).where(eq(accounts.role, 'landlord')).groupBy(accounts.actsFor),
  ]);
  const homesOf = new Map(homes.map((h) => [h.ownerId, Number(h.n)]));
  const teamOf = new Map(team.map((t) => [t.ownerId, Number(t.n)]));
  return NextResponse.json({ landlords: owners.map((o) => ({ ...o, homes: homesOf.get(o.id) ?? 0, coLandlords: teamOf.get(o.id) ?? 0 })) });
}
