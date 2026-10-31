import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { safeNextPath } from '@/lib/auth/safe-next';
import { homeFor, loadSession } from '@/lib/auth/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

const notices: Record<string, string> = {
  'signed-out': "You're signed out.",
  expired: 'Your session ended. Sign in again to continue.',
  deactivated: 'This account has been deactivated. Contact your landlord if you think this is a mistake.',
  'password-set': 'Your password is set. Sign in with it now.',
  'link-invalid': 'That link has expired or was already used. Request a new one below, or ask your landlord to resend your invite.',
};

export default async function LoginPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const next = safeNextPath(typeof searchParams.next === 'string' ? searchParams.next : undefined);
  const session = await loadSession();
  if (session?.account) redirect(next ?? homeFor(session.account.role));
  const reason = typeof searchParams.reason === 'string' ? notices[searchParams.reason] : undefined;
  // Old links used ?deactivated=1.
  const notice = reason ?? (searchParams.deactivated ? notices.deactivated : undefined);

  return (
    <AuthCard
      title="Sign in"
      lead="Rent, repairs, insurance and HOA for your rental homes, in one place."
      footer={
        <>
          Landlord without an account? <Link href="/signup" className="link">Create one</Link>.
          <br />
          Tenants: use the invite link your landlord sent you.
        </>
      }
    >
      {notice && (
        <p role="status" className="mt-5 rounded-md border border-line bg-subtle px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      )}
      <LoginForm next={next} />
      <p className="mt-5 text-sm">
        <Link href="/forgot-password" className="link">
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
