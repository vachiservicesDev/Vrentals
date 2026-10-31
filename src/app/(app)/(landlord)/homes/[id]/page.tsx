'use client';

import { useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, formValues, useAction, useResource } from '@/lib/client/api';
import { PAYMENT_METHODS, REMINDER_KINDS, REMINDER_REPEATS, REPAIR_STATUSES, REPAIR_URGENCIES, labelFrom, statusOf } from '@/lib/status';
import { Button, buttonClass } from '@/components/ui/Button';
import { receiptText, reminderText, smsLink } from '@/lib/rentals/messages';
import { CheckboxField, FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { MoneyPanel } from '@/components/money/MoneyPanel';
import { DocumentsPanel } from '@/components/documents/DocumentsPanel';
import { ApplicationsPanel, type Application } from '@/components/leasing/ApplicationsPanel';
import { ListingPanel } from '@/components/leasing/ListingPanel';
import { PROPERTY_USES } from '@/lib/rentals/homeowner';
import { STATE_OPTIONS, stateHints, stateName } from '@/lib/rentals/states';
import { Alert, Chip, DataTable, DetailList, EmptyState, Loading, PageHeader, Panel, TextLink, When, formatMoney } from '@/components/ui/ui';

interface Property {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state: string;
  zip: string | null;
  hoaName: string | null;
  hoaContact: string | null;
  notes: string | null;
  purchasePrice: string | null;
  landValue: string | null;
  placedInService: string | null;
  use: 'rental' | 'own';
  homeSqft: number | null;
  officeSqft: number | null;
}
interface Lease {
  id: string;
  tenantId: string | null;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string | null;
  startDate: string;
  endDate: string | null;
  monthlyRent: string;
  dueDay: number;
  graceDays: number;
  lateFee: string | null;
  securityDeposit: string | null;
  status: string;
  agreement: { id: string; status: 'draft' | 'sent' | 'signed' } | null;
}
interface Prefill {
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  startDate: string;
  monthlyRent: string;
}
interface Charge {
  id: string;
  leaseId: string;
  period: string;
  dueDate: string;
  amount: string;
  paidAmount: string;
  paidOn: string | null;
  paymentMethod: string | null;
  note: string | null;
  status: string;
  processing: string | null;
}
interface Repair {
  id: string;
  title: string;
  description: string | null;
  urgency: string;
  status: string;
  appointmentAt: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  cost: string | null;
  notes: string | null;
  createdAt: string;
}
interface Reminder {
  id: string;
  kind: string;
  title: string;
  provider: string | null;
  reference: string | null;
  amount: string | null;
  dueDate: string;
  repeat: string;
  notes: string | null;
  doneAt: string | null;
}
interface Detail {
  property: Property;
  landlordName: string | null;
  leases: Lease[];
  charges: Charge[];
  repairs: Repair[];
  reminders: Reminder[];
}

const monthLabel = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** Changes whenever a repair's cost or status, or a bill's due date, changes: each can add an expense. */
function moneyKey(repairs: Repair[], reminders: Reminder[]) {
  const text = [...repairs.map((r) => `${r.id}${r.status}${r.cost}`), ...reminders.map((r) => `${r.id}${r.dueDate}${r.doneAt}`)].join('|');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return hash.toString(36);
}

/** "2026-11-04T14:30:00.000Z" → the value a datetime-local input expects, in the viewer's time. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function RentalHomePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useResource<Detail>(`/api/properties/${params.id}`);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const newLease = useRef<HTMLDivElement>(null);
  const back = { href: '/dashboard', label: 'Dashboard' };

  if (loading && !data) return <Loading />;
  if (!data)
    return (
      <>
        <PageHeader back={back} title="Rental home" />
        <Alert title="Couldn't load this home">{error}</Alert>
      </>
    );

  const { property, landlordName, leases, charges, repairs, reminders } = data;
  const lease = leases.find((l) => l.status === 'active') ?? null;
  const past = leases.filter((l) => l.status !== 'active');
  const address = [property.address, property.city, `${property.state} ${property.zip ?? ''}`.trim()].filter(Boolean).join(', ');

  if (property.use === 'own')
    return (
      <>
        <PageHeader back={back} eyebrow="Your home" title={property.name} lead={address} actions={<Chip tone="info">You live here</Chip>} />
        <div className="grid gap-8">
          <RemindersPanel propertyId={property.id} reminders={reminders} own onChange={reload} />
          <MoneyPanel propertyId={property.id} own reloadKey={moneyKey(repairs, reminders)} />
          <RepairsPanel propertyId={property.id} repairs={repairs} own onChange={reload} />
          <DocumentsPanel propertyId={property.id} />
          <HomePanel property={property} onChange={reload} onDeleted={() => router.push('/dashboard')} />
        </div>
      </>
    );

  return (
    <>
      <PageHeader back={back} eyebrow="Rental home" title={property.name} lead={address} actions={lease ? <Chip tone="live">Occupied</Chip> : <Chip tone="new">Vacant</Chip>} />
      <div className="grid gap-8">
        {lease ? (
          <LeasePanel lease={lease} state={property.state} landlordName={landlordName} onChange={reload} />
        ) : (
          <div ref={newLease}>
            <NewLeasePanel key={prefill?.tenantEmail ?? 'blank'} propertyId={property.id} state={property.state} prefill={prefill} onChange={reload} />
          </div>
        )}
        <ListingPanel propertyId={property.id} state={property.state} defaultRent={lease?.monthlyRent ?? past[0]?.monthlyRent ?? null} vacant={!lease} />
        <ApplicationsPanel
          propertyId={property.id}
          canStartLease={!lease}
          onStartLease={(a: Application, askingRent) => {
            setPrefill({ tenantName: a.fullName, tenantEmail: a.email, tenantPhone: a.phone, startDate: a.moveInDate ?? '', monthlyRent: askingRent ? String(Number(askingRent)) : '' });
            newLease.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        {lease && <RentPanel lease={lease} home={property.name} landlordName={landlordName} charges={charges.filter((c) => c.leaseId === lease.id)} onChange={reload} />}
        <RepairsPanel propertyId={property.id} repairs={repairs} onChange={reload} />
        <RemindersPanel propertyId={property.id} reminders={reminders} onChange={reload} />
        <MoneyPanel
          propertyId={property.id}
          // Paying a bill or fixing a repair with a cost adds an expense, so refresh with them.
          reloadKey={moneyKey(repairs, reminders)}
        />
        <DocumentsPanel propertyId={property.id} />
        <HomePanel property={property} onChange={reload} onDeleted={() => router.push('/dashboard')} />
        {past.length > 0 && (
          <section>
            <h2 className="font-display mb-3 text-xl font-semibold text-ink">Past leases</h2>
            <ul className="grid gap-3">
              {past.map((l) => {
                const ledger = charges.filter((c) => c.leaseId === l.id);
                const owed = ledger.reduce((sum, c) => sum + Number(c.amount) - Number(c.paidAmount), 0);
                return (
                  <li key={l.id} className="rounded-lg border border-line bg-white">
                    <details>
                      <summary className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
                        <span className="font-semibold text-ink">{l.tenantName}</span>
                        <span className="text-sm text-muted">
                          {formatMoney(l.monthlyRent)} a month · <When iso={l.startDate} /> to <When iso={l.endDate} />
                          {owed > 0 && <span className="font-semibold text-danger-700"> · {formatMoney(owed)} unpaid</span>}
                        </span>
                      </summary>
                      <div className="grid gap-4 border-t border-line p-4">
                        {l.agreement && (
                          <p>
                            <TextLink href={`/agreements/${l.agreement.id}`}>{l.agreement.status === 'signed' ? 'Signed lease' : 'Written lease (not fully signed)'}</TextLink>
                          </p>
                        )}
                        {ledger.length === 0 ? (
                          <p className="text-ink-2">No rent was recorded for this lease.</p>
                        ) : (
                          <DataTable
                            caption={`Rent history for ${l.tenantName}`}
                            rows={ledger}
                            rowKey={(c) => c.id}
                            columns={[
                              { header: 'Month', primary: true, cell: (c) => monthLabel(c.period) },
                              { header: 'Rent', align: 'right', cell: (c) => formatMoney(c.amount) },
                              { header: 'Paid', align: 'right', cell: (c) => formatMoney(c.paidAmount) },
                              { header: 'Paid on', cell: (c) => <When iso={c.paidOn} /> },
                              { header: 'Status', cell: (c) => <Chip tone={statusOf('rent', c.status).tone}>{statusOf('rent', c.status).label}</Chip> },
                            ]}
                          />
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function LeasePanel({ lease, state, landlordName, onChange }: { lease: Lease; state: string; landlordName: string | null; onChange: () => void }) {
  const action = useAction();
  const [link, setLink] = useState<string | null>(null);

  async function invite(mode: 'email' | 'link') {
    setLink(null);
    const result = await action.run<{ outcome: string; link: string | null }>(mode, `/api/leases/${lease.id}/invite`, { body: { mode } });
    if (!result.ok || !result.data) return;
    if (result.data.link) {
      setLink(result.data.link);
      action.setSuccess('Invite link created. Text or email it to your tenant; it works once and expires in 24 hours.');
    } else if (result.data.outcome === 'existing') {
      action.setSuccess(`${lease.tenantEmail} already has a login, so they can sign in with their own password now. If they forgot it, they can use "Forgot password" on the sign-in page.`);
    } else {
      action.setSuccess(`Invite emailed to ${lease.tenantEmail}.`);
    }
    onChange();
  }

  async function endLease() {
    if (!window.confirm(`End ${lease.tenantName}'s lease? They'll no longer see this home in Rentals. Rent history is kept.`)) return;
    const result = await action.run('end', `/api/leases/${lease.id}`, { method: 'PATCH', body: { status: 'ended' } });
    if (result.ok) onChange();
  }

  return (
    <Panel title="Tenant and lease" actions={<Chip tone="live">Active lease</Chip>}>
      <div className="grid gap-6">
        <FormStatus error={action.error} success={action.success} />
        {link && (
          <div className="grid gap-2">
            <label htmlFor="invite-link" className="font-medium text-ink">
              Invite link
            </label>
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-md border border-line-input bg-subtle px-3 font-mono text-sm text-ink" />
          </div>
        )}
        <DetailList
          items={[
            { label: 'Tenant', value: lease.tenantName },
            { label: 'Email', value: lease.tenantEmail },
            { label: 'Phone', value: lease.tenantPhone ?? '—' },
            { label: 'Tenant login', value: lease.tenantId ? 'Invited' : 'Not invited yet' },
            { label: 'Monthly rent', value: formatMoney(lease.monthlyRent) },
            { label: 'Due', value: `${ordinal(lease.dueDay)} of each month, late after ${lease.graceDays} days` },
            { label: 'Late fee', value: lease.lateFee ? formatMoney(lease.lateFee) : 'None' },
            { label: 'Security deposit', value: formatMoney(lease.securityDeposit) },
            { label: 'Lease starts', value: <When iso={lease.startDate} /> },
            { label: 'Lease ends', value: <When iso={lease.endDate} empty="Month to month" /> },
          ]}
        />
        <div className="flex flex-wrap gap-3 border-t border-line pt-6">
          <Button variant="secondary" onClick={() => invite('link')} busy={action.busy === 'link'} busyLabel="Creating…">
            {lease.tenantId ? 'New sign-in link' : 'Create invite link'}
          </Button>
          <Button variant="secondary" onClick={() => invite('email')} busy={action.busy === 'email'} busyLabel="Sending…">
            Email the invite
          </Button>
          <Button variant="danger" onClick={endLease} busy={action.busy === 'end'} busyLabel="Ending…">
            End lease
          </Button>
        </div>
        <AgreementSection lease={lease} state={state} landlordName={landlordName} onChange={onChange} />
      </div>
    </Panel>
  );
}

const AGREEMENT_STATUS = {
  draft: { label: 'Draft: read it and sign', tone: 'muted' },
  sent: { label: 'Signed by you, waiting for the tenant', tone: 'warning' },
  signed: { label: 'Signed by both', tone: 'live' },
} as const;

/**
 * The written lease: filled in from this lease's terms plus a few extras, then signed in the app by
 * the landlord and the tenant. The signed copy stays with the home and this lease's term.
 */
function AgreementSection({ lease, state, landlordName, onChange }: { lease: Lease; state: string; landlordName: string | null; onChange: () => void }) {
  const action = useAction();
  const terms = useResource<{ agreement: { terms?: Record<string, unknown> } }>(lease.agreement?.status === 'draft' ? `/api/agreements/${lease.agreement.id}` : null);
  const a = lease.agreement;
  const t = (terms.data?.agreement.terms ?? {}) as Record<string, string | boolean | undefined>;
  const str = (k: string) => (typeof t[k] === 'string' ? (t[k] as string) : '');

  async function prepare(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()]));
    body.builtBefore1978 = fd.get('builtBefore1978') === 'on';
    const result = await action.run<{ agreement: { id: string } }>('prepare', `/api/leases/${lease.id}/agreement`, { body });
    if (result.ok && result.data) window.location.href = `/agreements/${result.data.agreement.id}`;
  }

  return (
    <section className="grid gap-4 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink">Written lease</h3>
        {a && <Chip tone={AGREEMENT_STATUS[a.status].tone}>{AGREEMENT_STATUS[a.status].label}</Chip>}
      </div>
      {a ? (
        <p className="flex flex-wrap gap-3">
          <a href={`/agreements/${a.id}`} className={buttonClass(a.status === 'draft' ? 'primary' : 'secondary')}>
            {a.status === 'draft' ? 'Review and sign' : a.status === 'signed' ? 'View signed lease' : 'View lease'}
          </a>
        </p>
      ) : (
        <p className="text-ink-2">Prepare a {stateName(state)} lease from the terms above, sign it here, and your tenant signs it from their account. The signed copy is saved with this home.</p>
      )}
      {(!a || a.status === 'draft') && !(a && terms.loading) && (
        <details className="rounded-lg border border-line" open={!a}>
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">{a ? 'Change the lease terms' : 'Prepare the lease'}</summary>
          <form onSubmit={prepare} noValidate className="grid gap-5 border-t border-line p-4">
            <FormStatus error={action.error} fieldErrors={action.fieldErrors} labels={{ landlordName: 'Landlord name', landlordAddress: 'Address for notices' }} />
            <p className="text-sm text-muted">Rent, due day, late fee, deposit and dates come from the lease above. To change those, end and re-add the lease before preparing.</p>
            <FieldRow>
              <TextField name="landlordName" label="Landlord name" required defaultValue={str('landlordName') || landlordName || ''} hint="You, or your LLC. You'll sign with this exact name." errors={action.fieldErrors} id={`f-a-name-${lease.id}`} />
              <TextField name="landlordAddress" label="Address for notices" required defaultValue={str('landlordAddress')} hint="Where the tenant sends written notices." errors={action.fieldErrors} id={`f-a-addr-${lease.id}`} />
            </FieldRow>
            <TextField name="occupants" label="Other people who will live there" defaultValue={str('occupants')} hint="Names of other adults and children, if any." errors={action.fieldErrors} id={`f-a-occ-${lease.id}`} />
            <FieldRow>
              <TextField name="utilitiesTenant" label="Tenant pays for" defaultValue={str('utilitiesTenant') || 'electricity, gas, internet and cable'} errors={action.fieldErrors} id={`f-a-ut-${lease.id}`} />
              <TextField name="utilitiesLandlord" label="Landlord pays for" defaultValue={str('utilitiesLandlord') || 'water, sewer and trash'} errors={action.fieldErrors} id={`f-a-ul-${lease.id}`} />
            </FieldRow>
            <FieldRow>
              <TextField name="parking" label="Parking" defaultValue={str('parking')} hint='Like "Two spaces, #14 and #15".' errors={action.fieldErrors} id={`f-a-park-${lease.id}`} />
              <TextField name="pets" label="Pets" defaultValue={str('pets')} hint="Leave empty for no pets without your consent." errors={action.fieldErrors} id={`f-a-pets-${lease.id}`} />
            </FieldRow>
            <FieldRow>
              <SelectField
                name="smoking"
                label="Smoking"
                options={[
                  { value: 'not_allowed', label: 'Not allowed anywhere' },
                  { value: 'outside_only', label: 'Outside only' },
                  { value: 'allowed', label: 'Allowed' },
                ]}
                defaultValue={str('smoking') || 'not_allowed'}
                id={`f-a-smoke-${lease.id}`}
              />
              <TextField name="rentPaymentMethod" label="How rent is paid" defaultValue={str('rentPaymentMethod')} hint="Like “Zelle or bank payment in the Rentals app”." errors={action.fieldErrors} id={`f-a-pay-${lease.id}`} />
            </FieldRow>
            <CheckboxField name="builtBefore1978" label="The home was built before 1978 (adds the lead paint clause)" hint="Before your tenant signs, give them the EPA lead pamphlet and the federal lead disclosure form, signed by both of you. Upload the signed form under Documents." defaultChecked={t.builtBefore1978 === true} id={`f-a-lead-${lease.id}`} />
            <TextAreaField name="extraTerms" label="Additional terms" rows={4} defaultValue={str('extraTerms')} hint="Anything else you both agree to, like snow removal or lawn care." errors={action.fieldErrors} id={`f-a-extra-${lease.id}`} />
            <div>
              <Button type="submit" busy={action.busy === 'prepare'} busyLabel="Preparing…">
                {a ? 'Update the lease' : 'Prepare the lease'}
              </Button>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}

function NewLeasePanel({ propertyId, state, prefill, onChange }: { propertyId: string; state: string; prefill: Prefill | null; onChange: () => void }) {
  const hints = stateHints(state);
  const action = useAction();

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = await action.run('save', `/api/properties/${propertyId}/leases`, { body: formValues(e.currentTarget) });
    if (result.ok) onChange();
  }

  return (
    <Panel title="Add the tenant and lease" description="This home is vacant. Add the tenant and the lease terms, then prepare the written lease for both of you to sign and invite the tenant so they can sign, see their rent and report repairs.">
      <form onSubmit={save} noValidate className="grid gap-5">
        {prefill && <Alert tone="info">Filled in from {prefill.tenantName}&apos;s application. Check everything before saving.</Alert>}
        <FormStatus
          error={action.error}
          fieldErrors={action.fieldErrors}
          labels={{ tenantName: 'Tenant name', tenantEmail: 'Tenant email', startDate: 'Lease starts', endDate: 'Lease ends', monthlyRent: 'Monthly rent', dueDay: 'Rent due day' }}
        />
        <FieldRow cols={3}>
          <TextField name="tenantName" label="Tenant name" required defaultValue={prefill?.tenantName} errors={action.fieldErrors} />
          <TextField name="tenantEmail" label="Tenant email" type="email" required defaultValue={prefill?.tenantEmail} errors={action.fieldErrors} />
          <TextField name="tenantPhone" label="Tenant phone" type="tel" defaultValue={prefill?.tenantPhone} errors={action.fieldErrors} />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField name="monthlyRent" label="Monthly rent ($)" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={prefill?.monthlyRent} errors={action.fieldErrors} />
          <TextField name="dueDay" label="Rent due day" type="number" min={1} max={28} defaultValue={1} required hint="Day of the month, 1 to 28." errors={action.fieldErrors} />
          <TextField name="graceDays" label="Grace period (days)" type="number" min={0} max={31} defaultValue={hints.graceDays} hint={hints.grace} errors={action.fieldErrors} />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField name="startDate" label="Lease starts" type="date" required defaultValue={prefill?.startDate} errors={action.fieldErrors} />
          <TextField name="endDate" label="Lease ends" type="date" hint="Leave empty for month to month." errors={action.fieldErrors} />
          <TextField name="securityDeposit" label="Security deposit ($)" type="number" inputMode="decimal" min={0} step="0.01" hint={hints.deposit} errors={action.fieldErrors} />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField name="lateFee" label="Late fee ($)" type="number" inputMode="decimal" min={0} step="0.01" errors={action.fieldErrors} />
        </FieldRow>
        <div>
          <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
            Save lease
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function RentPanel({ lease, home, landlordName, charges, onChange }: { lease: Lease; home: string; landlordName: string | null; charges: Charge[]; onChange: () => void }) {
  const action = useAction();
  const open = charges.filter((c) => c.status !== 'paid');
  const [chosen, setChosen] = useState<string>('');
  const selected = charges.find((c) => c.id === (chosen || open[open.length - 1]?.id));

  async function record(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const { chargeId: _ignored, received, ...rest } = formValues(e.currentTarget);
    // The API takes the month's running total; the form asks only for what just arrived.
    const total = Number(selected.paidAmount) + Number(received ?? 0);
    const body = { ...rest, paidAmount: received === undefined || Number.isNaN(total) ? received : total.toFixed(2) };
    const result = await action.run('pay', `/api/charges/${selected.id}`, { method: 'PATCH', body }, `Payment recorded for ${monthLabel(selected.period)}.`);
    if (result.ok) {
      setChosen('');
      onChange();
    }
  }

  return (
    <Panel id="rent" title="Rent" description={`${formatMoney(lease.monthlyRent)} a month. Add each month's rent from the Dashboard, then record payments here as they arrive.`}>
      <div className="grid gap-8">
        {charges.length === 0 ? (
          <EmptyState>No rent added yet. Use &quot;Add a month&apos;s rent&quot; on the Dashboard.</EmptyState>
        ) : (
          <DataTable
            caption="Rent by month"
            rows={charges}
            rowKey={(c) => c.id}
            columns={[
              { header: 'Month', primary: true, cell: (c) => monthLabel(c.period) },
              { header: 'Due', cell: (c) => <When iso={c.dueDate} /> },
              { header: 'Rent', align: 'right', cell: (c) => formatMoney(c.amount) },
              { header: 'Paid', align: 'right', cell: (c) => formatMoney(c.paidAmount) },
              { header: 'Paid on', cell: (c) => (c.paidOn ? <><When iso={c.paidOn} />{c.paymentMethod ? ` · ${labelFrom(PAYMENT_METHODS, c.paymentMethod)}` : ''}</> : '—') },
              {
                header: 'Status',
                cell: (c) => (
                  <span className="inline-flex flex-wrap gap-1.5">
                    <Chip tone={statusOf('rent', c.status).tone}>{statusOf('rent', c.status).label}</Chip>
                    {c.processing && <Chip tone="info">{formatMoney(c.processing)} bank payment on its way</Chip>}
                  </span>
                ),
              },
              { header: 'Tenant', align: 'right', cell: (c) => <ChargeActions charge={c} lease={lease} home={home} landlordName={landlordName} /> },
            ]}
          />
        )}
        {open.length > 0 && selected && (
          <form key={selected.id + selected.paidAmount} onSubmit={record} noValidate className="grid gap-5 border-t border-line pt-6">
            <h3 className="font-display text-lg font-semibold text-ink">Record a payment</h3>
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ paidAmount: 'Amount received', paidOn: 'Paid on' }} />
            <FieldRow>
              <SelectField
                name="chargeId"
                label="Month"
                required
                value={selected.id}
                onChange={(e) => setChosen(e.target.value)}
                options={open.map((c) => ({ value: c.id, label: `${monthLabel(c.period)}: ${formatMoney(Number(c.amount) - Number(c.paidAmount))} still owed` }))}
              />
              <TextField
                name="received"
                label="Amount received ($)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                required
                defaultValue={(Number(selected.amount) - Number(selected.paidAmount)).toFixed(2)}
                hint={Number(selected.paidAmount) > 0 ? `Just this payment. ${formatMoney(selected.paidAmount)} was already recorded for this month.` : 'Just this payment.'}
                errors={action.fieldErrors.paidAmount ? { received: action.fieldErrors.paidAmount } : action.fieldErrors}
              />
            </FieldRow>
            <FieldRow cols={3}>
              <TextField name="paidOn" label="Paid on" type="date" defaultValue={new Date().toISOString().slice(0, 10)} errors={action.fieldErrors} />
              <SelectField name="paymentMethod" label="How they paid" placeholder="Choose one" options={PAYMENT_METHODS} errors={action.fieldErrors} />
              <TextField name="note" label="Note" errors={action.fieldErrors} />
            </FieldRow>
            <div>
              <Button type="submit" busy={action.busy === 'pay'} busyLabel="Saving…">
                Record payment
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}

/**
 * Receipt and reminder shortcuts for one month. "Text" opens the landlord's own messages app with the
 * words filled in, so it comes from their number and costs nothing.
 */
function ChargeActions({ charge: c, lease, home, landlordName }: { charge: Charge; lease: Lease; home: string; landlordName: string | null }) {
  const paid = Number(c.paidAmount) > 0;
  const owed = c.status !== 'paid';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const base = { tenantName: lease.tenantName, landlordName, home, period: c.period, amount: c.amount, paidAmount: c.paidAmount };
  return (
    <span className="no-print inline-flex flex-wrap justify-end gap-2">
      {paid && (
        <a href={`/receipts/${c.id}`} className={buttonClass('secondary', 'sm')}>
          Receipt
        </a>
      )}
      {paid && lease.tenantPhone && (
        <a href={smsLink(lease.tenantPhone, receiptText({ ...base, paidOn: c.paidOn, paymentMethod: c.paymentMethod }, lease.tenantId ? `${origin}/receipts/${c.id}` : undefined))} className={buttonClass('ghost', 'sm')}>
          Text receipt
        </a>
      )}
      {owed && lease.tenantPhone && (
        <a href={smsLink(lease.tenantPhone, reminderText({ ...base, dueDate: c.dueDate, late: c.status === 'late' }))} className={buttonClass('ghost', 'sm')}>
          Text reminder
        </a>
      )}
      {!paid && !(owed && lease.tenantPhone) && <span className="text-sm text-muted">—</span>}
    </span>
  );
}

function RepairsPanel({ propertyId, repairs, own = false, onChange }: { propertyId: string; repairs: Repair[]; own?: boolean; onChange: () => void }) {
  const action = useAction();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = await action.run('add', `/api/properties/${propertyId}/repairs`, { body: formValues(form) }, 'Repair added.');
    if (result.ok) {
      form.reset();
      onChange();
    }
  }

  return (
    <Panel
      id="repairs"
      title="Repairs"
      description={
        own
          ? 'Keep track of what needs fixing, who is coming and what it cost. A repair marked fixed with a cost is added under Money.'
          : "Tenants report repairs from their account and you're notified. Set a visit time and they're told automatically."
      }
    >
      <div className="grid gap-6">
        {repairs.length === 0 ? (
          <EmptyState>No repairs yet.</EmptyState>
        ) : (
          <ul className="grid gap-4">
            {repairs.map((r) => (
              <RepairItem key={r.id + r.status + (r.appointmentAt ?? '')} repair={r} onChange={onChange} />
            ))}
          </ul>
        )}
        <details className="rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">{own ? 'Add a repair' : 'Log a repair yourself'}</summary>
          <form onSubmit={add} noValidate className="grid gap-5 border-t border-line p-4">
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ title: 'What needs fixing' }} />
            <FieldRow>
              <TextField name="title" label="What needs fixing" required maxLength={200} errors={action.fieldErrors} id="f-new-repair-title" />
              <SelectField name="urgency" label="Urgency" options={REPAIR_URGENCIES} defaultValue="normal" errors={action.fieldErrors} id="f-new-repair-urgency" />
            </FieldRow>
            <TextAreaField name="description" label="Details" rows={3} errors={action.fieldErrors} id="f-new-repair-description" />
            <div>
              <Button type="submit" busy={action.busy === 'add'} busyLabel="Adding…">
                Add repair
              </Button>
            </div>
          </form>
        </details>
      </div>
    </Panel>
  );
}

function RepairItem({ repair: r, onChange }: { repair: Repair; onChange: () => void }) {
  const action = useAction();
  const status = statusOf('repair', r.status);
  const urgency = statusOf('repairUrgency', r.urgency);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const visit = String(fd.get('appointmentAt') ?? '');
    const body = {
      status: String(fd.get('status')),
      appointmentAt: visit ? new Date(visit).toISOString() : '',
      vendorName: String(fd.get('vendorName') ?? ''),
      vendorPhone: String(fd.get('vendorPhone') ?? ''),
      cost: String(fd.get('cost') ?? ''),
      notes: String(fd.get('notes') ?? ''),
    };
    const result = await action.run('save', `/api/repairs/${r.id}`, { method: 'PATCH', body }, 'Repair updated.');
    if (result.ok) onChange();
  }

  const fid = (name: string) => `f-${name}-${r.id}`;
  return (
    <li className="rounded-lg border border-line p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{r.title}</p>
          <p className="mt-1 text-sm text-muted">
            Reported <When iso={r.createdAt} />
            {r.appointmentAt && (
              <>
                {' · '}Visit <When iso={r.appointmentAt} withTime />
              </>
            )}
            {r.vendorName && ` · ${r.vendorName}`}
          </p>
          {r.description && <p className="mt-2 whitespace-pre-line text-ink-2">{r.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.urgency !== 'normal' && <Chip tone={urgency.tone}>{urgency.label}</Chip>}
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
      </div>
      <details className="mt-4">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-700">Schedule or update</summary>
        <form onSubmit={save} noValidate className="mt-3 grid gap-5">
          <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} />
          <FieldRow>
            <SelectField name="status" label="Status" options={REPAIR_STATUSES} defaultValue={r.status} id={fid('status')} />
            <div className="grid gap-1.5">
              <label htmlFor={fid('appointmentAt')} className="font-medium text-ink">
                Visit date and time
              </label>
              <input id={fid('appointmentAt')} name="appointmentAt" type="datetime-local" defaultValue={toLocalInput(r.appointmentAt)} className="min-h-11 rounded-md border border-line-input bg-white px-3 text-ink focus:border-accent-600" />
            </div>
          </FieldRow>
          <FieldRow cols={3}>
            <TextField name="vendorName" label="Who's fixing it" defaultValue={r.vendorName} id={fid('vendorName')} />
            <TextField name="vendorPhone" label="Their phone" type="tel" defaultValue={r.vendorPhone} id={fid('vendorPhone')} />
            <TextField name="cost" label="Cost ($)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={r.cost} id={fid('cost')} errors={action.fieldErrors} />
          </FieldRow>
          <TextAreaField name="notes" label="Private notes" rows={2} defaultValue={r.notes} hint="Only you see these." id={fid('notes')} />
          <div>
            <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
              Save repair
            </Button>
          </div>
        </form>
      </details>
    </li>
  );
}

function RemindersPanel({ propertyId, reminders, own = false, onChange }: { propertyId: string; reminders: Reminder[]; own?: boolean; onChange: () => void }) {
  const action = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const active = reminders.filter((r) => !r.doneAt);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = await action.run('add', `/api/properties/${propertyId}/reminders`, { body: formValues(form) }, 'Reminder added.');
    if (result.ok) {
      form.reset();
      onChange();
    }
  }

  async function act(r: Reminder, kind: 'done' | 'delete') {
    if (kind === 'delete' && !window.confirm(`Delete "${r.title}"?`)) return;
    setBusyId(r.id + kind);
    setRowError(null);
    const result = kind === 'done' ? await api(`/api/reminders/${r.id}/done`, { method: 'POST' }) : await api(`/api/reminders/${r.id}`, { method: 'DELETE' });
    setBusyId(null);
    if (!result.ok) setRowError(result.message);
    else onChange();
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel
      id="reminders"
      title={own ? 'Payments coming up' : 'Insurance, HOA and bills'}
      description={
        own
          ? 'Mortgage, property tax, insurance, HOA and anything else that repeats. Marking one paid records it under Money and rolls it to the next date.'
          : 'Renewals and dues for this home. Marking one paid records it under Money; repeating ones then roll to the next date.'
      }
    >
      <div className="grid gap-6">
        {rowError && <Alert>{rowError}</Alert>}
        {active.length === 0 ? (
          <EmptyState>{own ? 'No payments yet. Add your property tax due dates, insurance renewal and HOA dues below.' : 'No reminders yet. Add your landlord insurance renewal and HOA dues below.'}</EmptyState>
        ) : (
          <DataTable
            caption="Reminders"
            rows={active}
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Reminder',
                primary: true,
                cell: (r) => (
                  <span>
                    {r.title}
                    {(r.provider || r.reference) && <span className="block text-sm font-normal text-muted">{[r.provider, r.reference].filter(Boolean).join(' · ')}</span>}
                  </span>
                ),
              },
              { header: 'Type', cell: (r) => labelFrom(REMINDER_KINDS, r.kind) },
              { header: 'Amount', align: 'right', cell: (r) => formatMoney(r.amount) },
              { header: 'Due', cell: (r) => (r.dueDate < today ? <Chip tone="danger">Overdue <When iso={r.dueDate} /></Chip> : <When iso={r.dueDate} />) },
              { header: 'Repeats', cell: (r) => labelFrom(REMINDER_REPEATS, r.repeat) },
              {
                header: 'Actions',
                align: 'right',
                cell: (r) => (
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="secondary" onClick={() => act(r, 'done')} busy={busyId === r.id + 'done'} busyLabel="Saving…">
                      {r.repeat === 'none' ? 'Mark done' : 'Mark paid'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r, 'delete')} busy={busyId === r.id + 'delete'} busyLabel="Deleting…">
                      Delete
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        )}
        <details className="rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">Add a reminder</summary>
          <form onSubmit={add} noValidate className="grid gap-5 border-t border-line p-4">
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ kind: 'Type', title: 'Title', dueDate: 'Due date' }} />
            <FieldRow>
              <SelectField name="kind" label="Type" required placeholder="Choose a type" options={REMINDER_KINDS} errors={action.fieldErrors} />
              <TextField name="title" label="Title" required hint='Like "Landlord insurance renewal".' errors={action.fieldErrors} id="f-reminder-title" />
            </FieldRow>
            <FieldRow cols={3}>
              <TextField name="dueDate" label="Due date" type="date" required errors={action.fieldErrors} />
              <SelectField name="repeat" label="Repeats" options={REMINDER_REPEATS} defaultValue="none" errors={action.fieldErrors} />
              <TextField name="amount" label="Amount ($)" type="number" inputMode="decimal" min={0} step="0.01" errors={action.fieldErrors} id="f-reminder-amount" />
            </FieldRow>
            <FieldRow>
              <TextField name="provider" label="Company" hint="Insurer, HOA or town." errors={action.fieldErrors} />
              <TextField name="reference" label="Policy or account number" errors={action.fieldErrors} />
            </FieldRow>
            <div>
              <Button type="submit" busy={action.busy === 'add'} busyLabel="Adding…">
                Add reminder
              </Button>
            </div>
          </form>
        </details>
      </div>
    </Panel>
  );
}

function HomePanel({ property, onChange, onDeleted }: { property: Property; onChange: () => void; onDeleted: () => void }) {
  const action = useAction();
  const own = property.use === 'own';

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Send empty values too, so clearing a field sticks.
    const body = Object.fromEntries(
      ['name', 'address', 'city', 'state', 'hoaName', 'hoaContact', 'notes', 'purchasePrice', 'placedInService', ...(own ? ['homeSqft', 'officeSqft'] : ['landValue'])].map((k) => [
        k,
        String(fd.get(k) ?? '').trim(),
      ]),
    );
    const use = String(fd.get('use') ?? property.use);
    const zip = String(fd.get('zip') ?? '').trim();
    const result = await action.run('save', `/api/properties/${property.id}`, { method: 'PATCH', body: { ...body, use, ...(zip ? { zip } : {}) } }, 'Home details saved.');
    if (result.ok) onChange();
  }

  async function remove() {
    const what = own ? 'its payments, repairs, reminders and documents' : 'its leases, rent history, repairs and reminders';
    if (!window.confirm(`Delete ${property.name}? This also deletes ${what}, and can't be undone.`)) return;
    const result = await action.run('delete', `/api/properties/${property.id}`, { method: 'DELETE' });
    if (result.ok) onDeleted();
  }

  return (
    <Panel title={own ? 'Home details, HOA and cost basis' : 'Home details, HOA and depreciation'}>
      <form onSubmit={save} noValidate className="grid gap-5">
        <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ name: 'Name', address: 'Street address', zip: 'ZIP code', use: 'How you use it' }} />
        <SelectField
          name="use"
          label="How do you use this home?"
          options={[...PROPERTY_USES]}
          defaultValue={property.use}
          hint="A home you live in has no tenant or lease, and its money becomes a homeowner tax summary instead of Schedule E."
          errors={action.fieldErrors}
          id="f-home-use"
        />
        <FieldRow>
          <TextField name="name" label="Name" required defaultValue={property.name} errors={action.fieldErrors} id="f-home-name" />
          <TextField name="address" label="Street address" required defaultValue={property.address} errors={action.fieldErrors} id="f-home-address" />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField name="city" label="City" defaultValue={property.city} errors={action.fieldErrors} id="f-home-city" />
          <SelectField name="state" label="State" options={STATE_OPTIONS} defaultValue={property.state} errors={action.fieldErrors} id="f-home-state" />
          <TextField name="zip" label="ZIP code" defaultValue={property.zip} errors={action.fieldErrors} id="f-home-zip" />
        </FieldRow>
        <FieldRow>
          <TextField name="hoaName" label="HOA name" defaultValue={property.hoaName} errors={action.fieldErrors} id="f-home-hoaName" />
          <TextAreaField name="hoaContact" label="HOA contact" rows={2} defaultValue={property.hoaContact} errors={action.fieldErrors} id="f-home-hoaContact" />
        </FieldRow>
        <TextAreaField name="notes" label="Notes" rows={3} defaultValue={property.notes} hint="Appliances, paint colors, alarm codes, anything worth keeping." errors={action.fieldErrors} id="f-home-notes" />
        {own ? (
          <>
            <fieldset className="grid gap-4 rounded-lg border border-line p-4">
              <legend className="px-1 font-semibold text-ink">For your cost basis</legend>
              <p className="text-sm text-ink-2">
                What you paid plus every improvement is your cost basis. When you sell, it lowers the gain you could owe tax on. Your closing statement has the numbers.
              </p>
              <FieldRow>
                <TextField name="purchasePrice" label="Purchase price ($)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={property.purchasePrice} hint="Plus closing costs like title, recording and transfer taxes." errors={action.fieldErrors} id="f-home-purchasePrice" />
                <TextField name="placedInService" label="Date you bought it" type="date" defaultValue={property.placedInService} errors={action.fieldErrors} id="f-home-placedInService" />
              </FieldRow>
            </fieldset>
            <fieldset className="grid gap-4 rounded-lg border border-line p-4">
              <legend className="px-1 font-semibold text-ink">Home office (self-employed only)</legend>
              <p className="text-sm text-ink-2">
                If you run a business or freelance from a room used only for work, part of your home costs can be deducted. W-2 employees working from home can&apos;t take this. Leave blank if it doesn&apos;t apply.
              </p>
              <FieldRow>
                <TextField name="homeSqft" label="Whole home (sq ft)" type="number" inputMode="numeric" min={1} step="1" defaultValue={property.homeSqft === null ? '' : String(property.homeSqft)} errors={action.fieldErrors} id="f-home-homeSqft" />
                <TextField name="officeSqft" label="Office (sq ft)" type="number" inputMode="numeric" min={1} step="1" defaultValue={property.officeSqft === null ? '' : String(property.officeSqft)} errors={action.fieldErrors} id="f-home-officeSqft" />
              </FieldRow>
            </fieldset>
          </>
        ) : (
          <fieldset className="grid gap-4 rounded-lg border border-line p-4">
            <legend className="px-1 font-semibold text-ink">For depreciation</legend>
            <p className="text-sm text-ink-2">The IRS lets you deduct the building&apos;s cost over 27.5 years. Fill these in once and the yearly report estimates it for you. Your closing statement and town assessment have the numbers.</p>
            <FieldRow cols={3}>
              <TextField name="purchasePrice" label="Purchase price ($)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={property.purchasePrice} hint="Plus closing costs you paid." errors={action.fieldErrors} id="f-home-purchasePrice" />
              <TextField name="landValue" label="Land value ($)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={property.landValue} hint="Land doesn't depreciate. The town assessment splits land and building." errors={action.fieldErrors} id="f-home-landValue" />
              <TextField name="placedInService" label="First ready to rent" type="date" defaultValue={property.placedInService} hint="The day it was first available for rent." errors={action.fieldErrors} id="f-home-placedInService" />
            </FieldRow>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
            Save details
          </Button>
          <Button variant="danger" onClick={remove} busy={action.busy === 'delete'} busyLabel="Deleting…">
            Delete home
          </Button>
        </div>
      </form>
    </Panel>
  );
}
