'use client';

import { useState } from 'react';
import { useAction, useResource } from '@/lib/client/api';
import { APPLICATION_STATUSES } from '@/lib/rentals/leasing';
import { Button } from '@/components/ui/Button';
import { SelectField, TextAreaField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DetailList, EmptyState, Panel, When, formatMoney } from '@/components/ui/ui';

export interface Application {
  id: string;
  status: string;
  fullName: string;
  email: string;
  phone: string;
  moveInDate: string | null;
  answers: Record<string, string | number | undefined>;
  signedName: string;
  signedAt: string;
  landlordNotes: string | null;
  createdAt: string;
}

const TONE: Record<string, 'new' | 'info' | 'live' | 'muted'> = { new: 'new', reviewing: 'info', approved: 'live', declined: 'muted' };
const statusLabel = (s: string) => APPLICATION_STATUSES.find((x) => x.value === s)?.label ?? s;

/** Applications from the listing link. Approving one can start the lease with the applicant's details. */
export function ApplicationsPanel({ propertyId, canStartLease, onStartLease }: { propertyId: string; canStartLease: boolean; onStartLease: (a: Application, askingRent: string | null) => void }) {
  const list = useResource<{ applications: Application[]; askingRent: string | null }>(`/api/properties/${propertyId}/applications`);
  const rows = list.data?.applications ?? [];
  const rent = list.data?.askingRent ?? null;
  return (
    <Panel id="applications" title="Applications" description="Applications sent from this home's listing link. Only you and your co-landlords see them.">
      <div className="grid gap-4">
        {list.error && <Alert>{list.error}</Alert>}
        {rows.length === 0 ? (
          <EmptyState>No applications yet. They arrive here when people apply from the listing link.</EmptyState>
        ) : (
          rows.map((a) => <ApplicationItem key={a.id} application={a} rent={rent} canStartLease={canStartLease} onStartLease={onStartLease} onChange={list.reload} />)
        )}
      </div>
    </Panel>
  );
}

function ApplicationItem({ application: a, rent, canStartLease, onStartLease, onChange }: { application: Application; rent: string | null; canStartLease: boolean; onStartLease: (a: Application, askingRent: string | null) => void; onChange: () => void }) {
  const action = useAction();
  const [open, setOpen] = useState(a.status === 'new');
  const x = a.answers;
  const income = Number(x.monthlyIncome ?? 0);
  const ratio = rent && Number(rent) > 0 ? income / Number(rent) : null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await action.run('save', `/api/applications/${a.id}`, { method: 'PATCH', body: { status: fd.get('status'), landlordNotes: String(fd.get('landlordNotes') ?? '') } }, 'Saved.');
    if (result.ok) onChange();
  }

  return (
    <article className="rounded-lg border border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="font-semibold text-ink">{a.fullName}</span>
          <span className="block text-sm text-muted">
            Applied <When iso={a.createdAt} /> · {formatMoney(income)}/mo income{ratio !== null ? ` (${ratio.toFixed(1)}× rent)` : ''}
          </span>
        </span>
        <Chip tone={TONE[a.status] ?? 'muted'}>{statusLabel(a.status)}</Chip>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-line p-4">
          <DetailList
            items={[
              { label: 'Email', value: <a className="link" href={`mailto:${a.email}`}>{a.email}</a> },
              { label: 'Phone', value: <a className="link" href={`tel:${a.phone}`}>{a.phone}</a> },
              { label: 'Move-in', value: <When iso={a.moveInDate} empty="Not given" /> },
              { label: 'Household', value: `${x.adults ?? 1} adult(s), ${x.children ?? 0} child(ren)` },
              { label: 'Current address', value: `${x.currentAddress ?? '—'}${x.currentSince ? ` (since ${x.currentSince})` : ''}` },
              { label: 'Current rent', value: x.currentRent ? formatMoney(x.currentRent) : '—' },
              { label: 'Current landlord', value: [x.currentLandlordName, x.currentLandlordPhone].filter(Boolean).join(' · ') || '—' },
              { label: 'Reason for moving', value: x.reasonForMoving || '—' },
              { label: 'Previous address', value: x.previousAddress || '—' },
              { label: 'Work', value: [x.jobTitle, x.employer, x.employedSince && `since ${x.employedSince}`].filter(Boolean).join(', ') || '—' },
              { label: 'Monthly income', value: `${formatMoney(income)}${x.incomeNotes ? ` · ${x.incomeNotes}` : ''}` },
              { label: 'Pets', value: x.pets || 'None' },
              { label: 'Vehicles', value: x.vehicles || '—' },
              { label: 'Reference', value: [x.referenceName, x.referencePhone].filter(Boolean).join(' · ') || '—' },
              { label: 'Evicted in last 7 years', value: x.evictionHistory === 'yes' ? `Yes${x.evictionDetails ? `: ${x.evictionDetails}` : ''}` : 'No' },
              { label: 'Signed', value: <>{a.signedName}, <When iso={a.signedAt} withTime /></> },
            ]}
          />
          {x.additionalInfo && <p className="whitespace-pre-line text-ink">“{x.additionalInfo}”</p>}
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-subtle p-3">
            <Button size="sm" variant="secondary" disabled>
              Credit and background check
            </Button>
            <Chip tone="info">Coming soon</Chip>
            <span className="text-sm text-muted">Applicants will authorize it themselves with a screening company.</span>
          </div>
          <form onSubmit={save} noValidate className="grid gap-4">
            <FormStatus error={action.error} success={action.success} />
            <SelectField name="status" label="Decision" options={[...APPLICATION_STATUSES]} defaultValue={a.status} id={`f-app-status-${a.id}`} />
            <TextAreaField name="landlordNotes" label="Your notes" rows={2} defaultValue={a.landlordNotes ?? ''} hint="Private. Base decisions on the same standards for everyone: income, history, references." id={`f-app-notes-${a.id}`} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" size="sm" busy={action.busy === 'save'} busyLabel="Saving…">
                Save
              </Button>
              {a.status === 'approved' && canStartLease && (
                <Button size="sm" variant="secondary" onClick={() => onStartLease(a, rent)}>
                  Start the lease with {a.fullName.split(' ')[0]}
                </Button>
              )}
            </div>
          </form>
        </div>
      )}
    </article>
  );
}
