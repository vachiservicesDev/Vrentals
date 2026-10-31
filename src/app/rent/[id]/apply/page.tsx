import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicListing } from '@/lib/rentals/listings';
import { PageHeader, formatMoney } from '@/components/ui/ui';
import { ApplicationForm } from './ApplicationForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rental application' };

export default async function ApplyPage({ params }: { params: { id: string } }) {
  const l = await publicListing(params.id);
  if (!l) notFound();
  return (
    <>
      <PageHeader
        back={{ href: `/rent/${l.id}`, label: l.headline || l.homeName }}
        eyebrow="Rental application"
        title={l.homeName}
        lead={`${l.address} · ${formatMoney(l.askingRent)} a month`}
      />
      <ApplicationForm listingId={l.id} landlordName={l.landlordName} />
      <p className="mt-6 text-sm text-muted">
        Already applied? The landlord will contact you. <Link href={`/rent/${l.id}`} className="link">Back to the home</Link>
      </p>
    </>
  );
}
