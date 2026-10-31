import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/auth/session';
import { DetailList, PageHeader, Panel } from '@/components/ui/ui';
import { AccountForm } from './AccountForm';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession();
  const account = session.account!;
  const landlord = account.role === 'landlord';
  return (
    <>
      <PageHeader title="Account" />
      <div className="grid gap-8">
        <Panel title="Your details" description={landlord ? 'Your tenants see this name, email and phone as their contact.' : undefined}>
          <AccountForm fullName={account.fullName ?? ''} phone={account.phone ?? ''} />
        </Panel>
        <Panel title="Sign-in">
          <DetailList
            items={[
              { label: 'Email', value: account.email },
              { label: 'Account type', value: landlord ? 'Landlord (free plan)' : 'Tenant' },
            ]}
          />
          <p className="mt-6">
            <Link href="/set-password" className="link">
              Change your password
            </Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
