import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { confirmUrl, resetEmail, sendMail, smtpConfigured } from '@/lib/email/mail';
import { createAdminClient } from '@/lib/supabase/admin';

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email() });

// One reset email per address per minute, per server instance. Best effort against someone
// filling another person's inbox; Supabase's own rate limits still apply to the link itself.
const recent = new Map<string, number>();
const WINDOW_MS = 60_000;

/**
 * "Forgot your password?" Sends the reset email from the app's own SMTP account, only to
 * addresses with a Rentals account. Answers the same either way, so it can't be used to find out
 * who has one.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: 'Enter a valid email.' }, { status: 400 });
  const email = body.data.email;

  const last = recent.get(email);
  if (last && Date.now() - last < WINDOW_MS) {
    return NextResponse.json({ message: 'Too many requests. Wait a few minutes, then try again.' }, { status: 429 });
  }
  recent.set(email, Date.now());

  if (!smtpConfigured()) return NextResponse.json({ ok: true });

  const [account] = await db.select({ fullName: accounts.fullName }).from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) return NextResponse.json({ ok: true });
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.user) return NextResponse.json({ ok: true });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  try {
    await sendMail(email, resetEmail(account.fullName ?? '', confirmUrl(appUrl, data.properties.hashed_token, 'recovery')));
  } catch (err) {
    console.error('[forgot-password] email failed', err);
  }
  return NextResponse.json({ ok: true });
}
