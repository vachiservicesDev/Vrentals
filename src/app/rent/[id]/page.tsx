import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { openSlots, publicListing } from '@/lib/rentals/listings';
import { buttonClass } from '@/components/ui/Button';
import { DetailList, PageHeader, Panel, formatMoney } from '@/components/ui/ui';
import { BookShowing } from './BookShowing';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const l = await publicListing(params.id);
  return { title: l ? `${l.headline || l.homeName} for rent` : 'Not available' };
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const count = (v: string | null, one: string) => (v ? `${Number(v)} ${one}${Number(v) === 1 ? '' : 's'}` : null);

/** A home for rent: the details, open showing times to book, and the link to apply. */
export default async function ListingPage({ params }: { params: { id: string } }) {
  const l = await publicListing(params.id);
  if (!l) notFound();
  const slots = await openSlots(l.propertyId);

  return (
    <>
      <PageHeader eyebrow="For rent" title={l.headline || l.homeName} lead={l.address} />
      <div className="grid gap-8">
        <Panel title={`${formatMoney(l.askingRent)} a month`}>
          <DetailList
            items={[
              { label: 'Available', value: l.availableFrom ? day(l.availableFrom) : 'Now' },
              { label: 'Security deposit', value: l.securityDeposit ? formatMoney(l.securityDeposit) : 'Ask the landlord' },
              { label: 'Size', value: [count(l.bedrooms, 'bedroom'), count(l.bathrooms, 'bathroom'), l.squareFeet ? `${l.squareFeet.toLocaleString()} sq ft` : null].filter(Boolean).join(' · ') || '—' },
              { label: 'Pets', value: l.petPolicy || 'Ask the landlord' },
            ]}
          />
          {l.description && <p className="mt-6 whitespace-pre-line text-ink">{l.description}</p>}
          <div className="mt-6">
            <Link href={`/rent/${l.id}/apply`} className={buttonClass('primary')}>
              Apply for this home
            </Link>
          </div>
        </Panel>
        <Panel id="showings" title="Book a showing" description={`Pick a time to see the home in person. Times are ${l.stateName} time.`}>
          <BookShowing listingId={l.id} timeZone={l.timeZone} slots={slots.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), minutes: s.minutes }))} />
        </Panel>
      </div>
    </>
  );
}
