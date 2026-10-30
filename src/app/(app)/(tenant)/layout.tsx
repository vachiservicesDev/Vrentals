import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';

/** Tenant pages; landlords are sent to their dashboard. */
export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.account?.role !== 'tenant') redirect('/dashboard');
  return <>{children}</>;
}
