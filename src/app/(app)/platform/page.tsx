import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/ui';
import { LandlordPlans } from './LandlordPlans';

export const metadata: Metadata = { title: 'Licenses' };
export const dynamic = 'force-dynamic';

/** Vachi staff only: invitation links and every account's license, the way VTrack's platform page lists companies. */
export default async function PlatformPage() {
  const session = await requireSession();
  if (!session.platformAdmin) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Vachi platform"
        title="Licenses"
        lead="Invite landlords and homeowners, and set how many homes each can manage, until when, and whether they've paid. Sign-up is by invitation only. After a license's end date the account can still see everything but can't make changes."
      />
      <LandlordPlans selfId={session.account!.id} />
    </>
  );
}
