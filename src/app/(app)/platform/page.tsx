import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/ui';
import { LandlordPlans } from './LandlordPlans';

export const metadata: Metadata = { title: 'Landlord plans' };
export const dynamic = 'force-dynamic';

/** Vachi staff only: every landlord's plan, the way VTrack's platform page lists companies. */
export default async function PlatformPage() {
  const session = await requireSession();
  if (!session.platformAdmin) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Vachi platform"
        title="Landlord plans"
        lead="Set how many homes each landlord can manage and until when. New sign-ups start on a 30-day trial for 2 homes. After a plan's end date the landlord can still see everything but can't make changes."
      />
      <LandlordPlans selfId={session.account!.id} />
    </>
  );
}
