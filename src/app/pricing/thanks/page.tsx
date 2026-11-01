import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { fulfillPurchase, purchaseForSession, signupLink } from '@/lib/rentals/billing';
import { stripe } from '@/lib/stripe';

export const metadata: Metadata = { title: 'Thank you' };
export const dynamic = 'force-dynamic';

/**
 * Where Stripe sends a buyer after paying. If the webhook hasn't arrived yet, the session is
 * checked with Stripe directly, so a paid buyer can sign up straight away.
 */
export default async function ThanksPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const sessionId = typeof searchParams.session_id === 'string' && /^cs_[A-Za-z0-9_]+$/.test(searchParams.session_id) ? searchParams.session_id : '';
  let row = sessionId ? await purchaseForSession(sessionId) : null;
  if (row && row.purchase.status === 'started') {
    const session = await stripe()
      .checkout.sessions.retrieve(sessionId)
      .catch(() => null);
    if (session?.payment_status === 'paid' && session.metadata?.vrentals_purchase === row.purchase.id) {
      await fulfillPurchase(sessionId, process.env.NEXT_PUBLIC_APP_URL || '');
      row = await purchaseForSession(sessionId);
    }
  }

  if (!row) {
    return (
      <AuthCard title="Payment not found" lead="We couldn't find that payment." footer={<Link href="/pricing" className="link">Back to plans</Link>}>
        <p className="mt-6 text-ink">If you were charged, contact Vachi Services and we&apos;ll sort it out.</p>
      </AuthCard>
    );
  }
  const { purchase, token, usedAt } = row;
  if (purchase.status === 'paid' && token && !usedAt) {
    const link = signupLink(process.env.NEXT_PUBLIC_APP_URL || '', token).replace(/^https?:\/\/[^/]*/, '');
    return (
      <AuthCard title="Thank you, you're all set" lead={`Your payment for ${purchase.planName} went through.`}>
        <p className="mt-6 text-ink">Create your account now. We also emailed this link to {purchase.email}.</p>
        <Link href={link} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
          Create my account
        </Link>
      </AuthCard>
    );
  }
  if (purchase.status === 'paid') {
    return (
      <AuthCard title="Thank you, payment received" lead={`Your payment for ${purchase.planName} went through.`}>
        <p className="mt-6 text-ink">It&apos;s already added to your account.</p>
        <Link href="/login" className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">
          Go to Vrentals
        </Link>
      </AuthCard>
    );
  }
  if (purchase.status === 'failed') {
    return (
      <AuthCard title="Payment didn't go through" footer={<Link href="/pricing" className="link">Back to plans</Link>}>
        <p className="mt-6 text-ink">Your bank declined the payment, so no money moved. Please try again or use a card.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Thank you, payment started" lead="Bank payments take a few business days to confirm.">
      <p className="mt-6 text-ink">When it&apos;s confirmed, we&apos;ll email your sign-up link to {purchase.email}.</p>
    </AuthCard>
  );
}
