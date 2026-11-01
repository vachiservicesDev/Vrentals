import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { homeFor, loadSession } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pricePlans } from '@/db/schema';
import { openInvite } from '@/lib/rentals/licenses';
import { billingConfigured } from '@/lib/rentals/billing';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

/** Sign-up is invite-only: the form shows only for an unused invitation link from Vachi staff. */
export default async function SignupPage({ searchParams }: { searchParams: { invite?: string } }) {
  const session = await loadSession();
  if (session?.account) redirect(homeFor(session.account.role));
  const token = typeof searchParams.invite === 'string' ? searchParams.invite : '';
  const invite = token ? await openInvite(token) : null;
  const plansOnSale = !invite && billingConfigured() && (await db.select({ id: pricePlans.id }).from(pricePlans).where(eq(pricePlans.isActive, true)).limit(1)).length > 0;
  const footer = (
    <>
      Already have an account? <Link href="/login" className="link">Sign in</Link>.
    </>
  );

  if (!invite) {
    return (
      <AuthCard title="Vrentals is by invitation" lead="To create an account you need an invitation link from Vachi Services." footer={footer}>
        <p role="status" className="mt-6 rounded-md border border-line bg-subtle px-4 py-3 text-ink">
          {token ? 'This invitation link has already been used or was cancelled. Ask Vachi Services for a new one.' : 'Ask Vachi Services for an invitation link, then open it on this device to sign up.'}
        </p>
        {plansOnSale && (
          <Link href="/pricing" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
            Or buy a plan and start now
          </Link>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" lead="You've been invited to Vrentals. Keep bills, repairs, insurance and HOA dates for your home or your rentals in one place." footer={footer}>
      <SignupForm invite={{ token, email: invite.email, kind: invite.kind === 'homeowner' ? 'homeowner' : 'landlord' }} />
    </AuthCard>
  );
}
