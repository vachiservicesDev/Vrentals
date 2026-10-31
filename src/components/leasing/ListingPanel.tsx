'use client';

import { useState } from 'react';
import { api, useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { CheckboxField, FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, EmptyState, Panel } from '@/components/ui/ui';
import { stateHints, stateName, stateTimeZone } from '@/lib/rentals/states';

interface Listing {
  id: string;
  active: boolean;
  headline: string | null;
  description: string | null;
  askingRent: string;
  securityDeposit: string | null;
  availableFrom: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  squareFeet: number | null;
  petPolicy: string | null;
}
interface Slot {
  id: string;
  startsAt: string;
  minutes: number;
  booking: { name: string; email: string; phone: string | null; note: string | null } | null;
}

const QUICK_TIMES = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '17:30', '18:00', '18:30', '19:00'];
const label12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const num = (v: string | null) => (v === null ? '' : String(Number(v)));

/** Advertise an empty home: a public page with its details, showing times to book, and the application. */
export function ListingPanel({ propertyId, state, defaultRent, vacant }: { propertyId: string; state: string; defaultRent: string | null; vacant: boolean }) {
  const timeZone = stateTimeZone(state);
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone });
  const listing = useResource<{ listing: Listing | null }>(`/api/properties/${propertyId}/listing`);
  const slots = useResource<{ slots: Slot[] }>(`/api/properties/${propertyId}/showings`);
  const save = useAction();
  const add = useAction();
  const [rowError, setRowError] = useState<string | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const l = listing.data?.listing ?? null;
  const url = l && typeof window !== 'undefined' ? `${window.location.origin}/rent/${l.id}` : '';

  async function saveListing(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
    body.active = fd.get('active') === 'on';
    const result = await save.run('save', `/api/properties/${propertyId}/listing`, { method: 'PUT', body }, 'Saved.');
    if (result.ok) listing.reload();
  }

  async function addTimes(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await add.run<{ created: number }>('add', `/api/properties/${propertyId}/showings`, { body: { date: String(fd.get('date') ?? ''), times, minutes: String(fd.get('minutes') ?? '30') } });
    if (result.ok && result.data) {
      add.setSuccess(`${result.data.created} ${result.data.created === 1 ? 'time' : 'times'} added.`);
      setTimes([]);
      slots.reload();
    }
  }

  async function act(s: Slot, kind: 'delete' | 'cancel') {
    const msg = kind === 'cancel' ? `Cancel ${s.booking?.name}'s showing? Let them know yourself; the time opens up again.` : 'Remove this showing time?';
    if (!window.confirm(msg)) return;
    setRowError(null);
    const result = await api(kind === 'cancel' ? `/api/showings/${s.id}/cancel` : `/api/showings/${s.id}`, { method: kind === 'cancel' ? 'POST' : 'DELETE', body: kind === 'cancel' ? {} : undefined });
    if (!result.ok) setRowError(result.message);
    else slots.reload();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const rows = slots.data?.slots ?? [];
  return (
    <Panel
      id="listing"
      title="For rent: listing and showings"
      description="Share one link where people see the home, book a time to visit, and apply. Turn it off once the home is rented."
      actions={l ? <Chip tone={l.active ? 'live' : 'muted'}>{l.active ? 'Listed' : 'Off'}</Chip> : undefined}
    >
      <div className="grid gap-8">
        {listing.error && <Alert>{listing.error}</Alert>}
        {l?.active && (
          <div className="grid gap-2">
            <label htmlFor={`listing-url-${propertyId}`} className="font-medium text-ink">
              Public link
            </label>
            <div className="flex flex-wrap gap-2">
              <input id={`listing-url-${propertyId}`} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-md border border-line-input bg-subtle px-3 font-mono text-sm text-ink" />
              <Button variant="secondary" onClick={copy}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 font-semibold text-brand-700">
                Open
              </a>
            </div>
            <p className="text-sm text-muted">Post it on Zillow, Facebook Marketplace or Craigslist, or text it to people who ask.</p>
          </div>
        )}
        {!l && !vacant && <p className="text-muted">This home has a tenant. You can still set up a listing ahead of time, for when the lease ends.</p>}

        {!listing.loading && (
          <details className="rounded-lg border border-line" open={!l}>
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">{l ? 'Edit listing' : 'Create a listing'}</summary>
            <form key={l?.id ?? 'new'} onSubmit={saveListing} noValidate className="grid gap-5 border-t border-line p-4">
              <FormStatus error={save.error} success={save.success} fieldErrors={save.fieldErrors} labels={{ askingRent: 'Monthly rent' }} />
              <TextField name="headline" label="Headline" defaultValue={l?.headline ?? ''} hint='Like "Sunny 2-bed townhome near WCSU".' errors={save.fieldErrors} id={`f-l-headline-${propertyId}`} />
              <FieldRow cols={3}>
                <TextField name="askingRent" label="Monthly rent ($)" type="number" min={0} step="0.01" required defaultValue={l ? num(l.askingRent) : num(defaultRent)} errors={save.fieldErrors} id={`f-l-rent-${propertyId}`} />
                <TextField name="securityDeposit" label="Security deposit ($)" type="number" min={0} step="0.01" defaultValue={num(l?.securityDeposit ?? null)} hint={stateHints(state).deposit} errors={save.fieldErrors} id={`f-l-dep-${propertyId}`} />
                <TextField name="availableFrom" label="Available from" type="date" defaultValue={l?.availableFrom ?? ''} errors={save.fieldErrors} id={`f-l-avail-${propertyId}`} />
              </FieldRow>
              <FieldRow cols={3}>
                <TextField name="bedrooms" label="Bedrooms" type="number" min={0} step="0.5" defaultValue={num(l?.bedrooms ?? null)} errors={save.fieldErrors} id={`f-l-bed-${propertyId}`} />
                <TextField name="bathrooms" label="Bathrooms" type="number" min={0} step="0.5" defaultValue={num(l?.bathrooms ?? null)} errors={save.fieldErrors} id={`f-l-bath-${propertyId}`} />
                <TextField name="squareFeet" label="Square feet" type="number" min={0} defaultValue={l?.squareFeet ?? ''} errors={save.fieldErrors} id={`f-l-sqft-${propertyId}`} />
              </FieldRow>
              <TextField name="petPolicy" label="Pets" defaultValue={l?.petPolicy ?? ''} hint='Like "Cats OK, no dogs". Assistance animals are always allowed.' errors={save.fieldErrors} id={`f-l-pets-${propertyId}`} />
              <TextAreaField name="description" label="Description" rows={4} defaultValue={l?.description ?? ''} hint="Describe the home, not the people you want: fair housing law bars wording like “ideal for young professionals” or “no kids”." errors={save.fieldErrors} id={`f-l-desc-${propertyId}`} />
              <CheckboxField name="active" label="Listed (the public link works)" defaultChecked={l ? l.active : true} id={`f-l-active-${propertyId}`} />
              <div>
                <Button type="submit" busy={save.busy === 'save'} busyLabel="Saving…">
                  {l ? 'Save listing' : 'Create listing'}
                </Button>
              </div>
            </form>
          </details>
        )}

        {l && (
          <section className="grid gap-5 border-t border-line pt-6">
            <h3 className="font-display text-lg font-semibold text-ink">Showing times</h3>
            {rowError && <Alert>{rowError}</Alert>}
            {rows.length === 0 ? (
              <EmptyState>No upcoming showing times. Add some below and people can book them from the link.</EmptyState>
            ) : (
              <DataTable
                caption="Upcoming showing times"
                rows={rows}
                rowKey={(s) => s.id}
                columns={[
                  { header: `When (${stateName(state)} time)`, primary: true, cell: (s) => `${when(s.startsAt)} · ${s.minutes} min` },
                  {
                    header: 'Booked by',
                    cell: (s) =>
                      s.booking ? (
                        <span>
                          {s.booking.name}
                          <span className="block text-sm text-muted">{[s.booking.phone, s.booking.email].filter(Boolean).join(' · ')}</span>
                          {s.booking.note && <span className="block text-sm text-muted">“{s.booking.note}”</span>}
                        </span>
                      ) : (
                        <Chip tone="muted">Open</Chip>
                      ),
                  },
                  {
                    header: 'Actions',
                    align: 'right',
                    cell: (s) => (
                      <Button size="sm" variant="ghost" onClick={() => act(s, s.booking ? 'cancel' : 'delete')}>
                        {s.booking ? 'Cancel booking' : 'Remove'}
                      </Button>
                    ),
                  },
                ]}
              />
            )}
            <form onSubmit={addTimes} noValidate className="grid gap-5 rounded-lg border border-line p-4">
              <FormStatus error={add.error} success={add.success} fieldErrors={add.fieldErrors} labels={{ date: 'Date', times: 'Times' }} />
              <FieldRow>
                <TextField name="date" label="Day" type="date" required errors={add.fieldErrors} id={`f-s-date-${propertyId}`} />
                <SelectField
                  name="minutes"
                  label="Each showing lasts"
                  options={[
                    { value: '15', label: '15 minutes' },
                    { value: '30', label: '30 minutes' },
                    { value: '45', label: '45 minutes' },
                    { value: '60', label: '1 hour' },
                  ]}
                  defaultValue="30"
                  id={`f-s-min-${propertyId}`}
                />
              </FieldRow>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-ink">Start times (pick one or more)</legend>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TIMES.map((t) => (
                    <label key={t} className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm font-medium ${times.includes(t) ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-line-input bg-white text-ink'}`}>
                      <input type="checkbox" className="sr-only" checked={times.includes(t)} onChange={() => setTimes(times.includes(t) ? times.filter((x) => x !== t) : [...times, t].sort())} />
                      {label12(t)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <Button type="submit" busy={add.busy === 'add'} busyLabel="Adding…" disabled={times.length === 0}>
                  Add {times.length || ''} {times.length === 1 ? 'time' : 'times'}
                </Button>
              </div>
            </form>
          </section>
        )}
      </div>
    </Panel>
  );
}
