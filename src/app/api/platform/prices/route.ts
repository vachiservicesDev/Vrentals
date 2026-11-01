import { NextRequest, NextResponse } from 'next/server';
import { asc, desc } from 'drizzle-orm';
import { db } from '@/db';
import { pricePlans } from '@/db/schema';
import { requirePlatformAdmin } from '@/lib/auth/guards';
import { billingConfigured } from '@/lib/rentals/billing';
import { priceSchema, priceValues } from '@/lib/rentals/priceSchema';

/** Every price plan, offered or not, and whether online payment is switched on. Vachi staff only. */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const plans = await db.select().from(pricePlans).orderBy(desc(pricePlans.isActive), asc(pricePlans.price));
  return NextResponse.json({ plans, billing: { configured: billingConfigured(), stripeKey: !!process.env.STRIPE_SECRET_KEY, webhookSecret: !!process.env.STRIPE_BILLING_WEBHOOK_SECRET } });
}

/** Adds a price plan. It shows on /pricing straight away when it's offered. */
export async function POST(request: NextRequest) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });
  const body = priceSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const [plan] = await db.insert(pricePlans).values(priceValues(body.data)).returning();
  return NextResponse.json({ plan }, { status: 201 });
}
