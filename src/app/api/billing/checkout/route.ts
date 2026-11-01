import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { accountFor } from '@/lib/auth/guards';
import { startPlanCheckout } from '@/lib/rentals/billing';

const schema = z.object({
  planId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email('Enter a full email address.').max(320),
  fullName: z.string().trim().min(1, 'Enter your name.').max(200),
});

/**
 * Opens Stripe checkout for a plan. Anyone can buy; when the buyer is signed in, the payment
 * extends their own license instead of making a new sign-up link.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user ? await accountFor(user) : null;
  const body = schema.safeParse({ ...(await request.json().catch(() => ({}))), ...(account ? { email: account.email, fullName: account.fullName || account.email } : {}) });
  if (!body.success) return NextResponse.json({ message: 'Invalid input', errors: body.error.flatten() }, { status: 400 });
  const owner = account && account.role === 'landlord' && !account.actsFor ? account : null;
  if (account && !owner) return NextResponse.json({ message: 'Only the account owner can buy a plan.' }, { status: 403 });
  const result = await startPlanCheckout(body.data.planId, { email: body.data.email, fullName: body.data.fullName }, owner, process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });
  return NextResponse.json({ url: result.url });
}
