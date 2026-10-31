import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireAccount } from '@/lib/auth/guards';

export async function POST() {
  const gate = await requireAccount();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, gate.account.id), isNull(notifications.readAt)));
  return NextResponse.json({ ok: true });
}
