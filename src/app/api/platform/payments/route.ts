import { NextResponse } from 'next/server';
import { desc, ne } from 'drizzle-orm';
import { db } from '@/db';
import { planPurchases } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';

/** Online plan payments, newest first (checkouts nobody finished are left out). Vachi staff only. */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const payments = await db.select().from(planPurchases).where(ne(planPurchases.status, 'expired')).orderBy(desc(planPurchases.createdAt)).limit(200);
  return NextResponse.json({ payments: payments.filter((p) => p.status !== 'started') });
}
