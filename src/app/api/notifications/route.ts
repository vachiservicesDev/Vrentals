import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireAccount } from '@/lib/auth/guards';

/** The caller's latest 50 notifications, newest first. */
export async function GET() {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const rows = await db.select().from(notifications).where(eq(notifications.accountId, gate.account.id)).orderBy(desc(notifications.createdAt)).limit(50);
  return NextResponse.json({ notifications: rows });
}
