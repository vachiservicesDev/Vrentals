import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { homeFor, loadSession } from '@/lib/auth/session';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage() {
  const session = await loadSession();
  if (session?.account) redirect(homeFor(session.account.role));
  return (
    <AuthCard
      title="Create a landlord account"
      lead="Track rent, schedule repairs and keep insurance and HOA dates in one place. Free while we're getting started."
      footer={
        <>
          Already have an account? <Link href="/login" className="link">Sign in</Link>.
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
