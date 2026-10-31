import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { todayEastern } from '@/lib/dates';
import { runRentReminders } from '@/lib/rentals/autoReminders';

export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The daily rent reminders, run by Vercel Cron (see vercel.json) with CRON_SECRET as a Bearer token. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const result = await runRentReminders(todayEastern(), process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin);
  return NextResponse.json(result);
}
