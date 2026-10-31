import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { buttonClass } from '@/components/ui/Button';
import { loadSession } from '@/lib/auth/session';
import { signOutAction } from '../actions';

export const metadata: Metadata = { title: 'No account' };

/** A login that exists in Supabase but has no Vrentals account (for example from another app). */
export default async function NoAccessPage() {
  const session = await loadSession();
  return (
    <AuthCard
      title="No Vrentals account"
      lead={
        <>
          {session ? <>You&apos;re signed in as <span className="font-medium text-ink">{session.email}</span>, but</> : 'This login'} doesn&apos;t have a Vrentals account yet. Tenants get access when their landlord
          invites them. Landlords can create an account.
        </>
      }
    >
      <div className="mt-6 flex flex-wrap gap-3">
        <form action={signOutAction}>
          <button type="submit" className={buttonClass('primary')}>
            Sign out
          </button>
        </form>
        <Link href="/signup" className={buttonClass('secondary')}>
          Create a landlord account
        </Link>
      </div>
    </AuthCard>
  );
}
