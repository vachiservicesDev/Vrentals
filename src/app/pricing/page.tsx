import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { pricePlans } from '@/db/schema';
import { loadSession } from '@/lib/auth/session';
import { billingConfigured } from '@/lib/rentals/billing';
import { Logo } from '@/components/ui/Logo';
import { Footer } from '@/components/shell/Footer';
import { PlanPicker } from './PlanPicker';

export const metadata: Metadata = { title: 'Plans and pricing' };
export const dynamic = 'force-dynamic';

/** Public: the plans Vachi staff offer, with a Pay button that opens Stripe checkout. */
export default async function PricingPage() {
  const [plans, session] = await Promise.all([db.select().from(pricePlans).where(eq(pricePlans.isActive, true)).orderBy(asc(pricePlans.price)), loadSession()]);
  const account = session?.account && session.account.role === 'landlord' && !session.account.actsFor ? { email: session.account.email, name: session.account.fullName || '' } : null;
  return (
    <>
      <main id="main" className="grid-bg flex-1 px-4 py-12">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-8 flex justify-center">
            <Logo href={session?.account ? '/' : null} />
          </div>
          <div className="mb-8 text-center">
            <h1 className="font-display text-3xl font-semibold text-ink">{account ? 'Renew or change your plan' : 'Choose your plan'}</h1>
            <p className="mx-auto mt-2 max-w-xl text-ink-2">
              {account ? "Pay for more time or more homes. It's added to your account as soon as the payment goes through." : 'Pay online, then create your account with the link we send you. You can start using Vrentals right away.'}
            </p>
          </div>
          {plans.length === 0 || !billingConfigured() ? (
            <p role="status" className="mx-auto max-w-md rounded-md border border-line bg-white px-4 py-3 text-center text-ink">
              Online sign-up isn&apos;t open yet. Contact Vachi Services for an invitation.
            </p>
          ) : (
            <PlanPicker
              account={account}
              plans={plans.map((p) => ({ id: p.id, name: p.name, kind: p.kind, homeLimit: p.homeLimit, months: p.months, price: p.price, description: p.description }))}
            />
          )}
          {!account && (
            <p className="mt-8 text-center text-sm text-muted">
              Already have an account? <Link href="/login" className="link">Sign in</Link>.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
