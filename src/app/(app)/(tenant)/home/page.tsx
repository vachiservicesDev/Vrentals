'use client';

import { formValues, useAction, useResource } from '@/lib/client/api';
import { REPAIR_URGENCIES, statusOf } from '@/lib/status';
import { Button, buttonClass } from '@/components/ui/Button';
import { LeasingPath } from '@/components/leasing/LeasingPath';
import { ACTIVE_STEP, tenantStep } from '@/lib/rentals/leasingPath';
import { FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, DetailList, EmptyState, Loading, PageHeader, Panel, TextLink, When, formatDate, formatMoney } from '@/components/ui/ui';

interface Rental {
  home: { name: string; address: string; city: string | null; state: string; zip: string | null };
  lease: { startDate: string; endDate: string | null; monthlyRent: string; dueDay: number; graceDays: number; lateFee: string | null; securityDeposit: string | null };
  landlord: { name: string | null; email: string; phone: string | null } | null;
  charges: { id: string; period: string; dueDate: string; amount: string; paidAmount: string; paidOn: string | null; status: string; processing: string | null }[];
  onlinePayments: boolean;
  agreement: { id: string; status: 'sent' | 'signed' } | null;
  repairs: { id: string; title: string; description: string | null; urgency: string; status: string; appointmentAt: string | null; vendorName: string | null; createdAt: string; completedAt: string | null }[];
}

const monthLabel = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** A tenant's home: what they owe, their repairs, their lease and how to reach the landlord. */
export default function TenantRentalPage() {
  const { data, error, loading, reload } = useResource<{ rental: Rental | null }>('/api/me');
  const action = useAction();
  const pay = useAction();
  const rental = data?.rental;
  const paymentNote = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('payment');

  async function payOnline(chargeId: string) {
    const result = await pay.run<{ url: string }>(`pay-${chargeId}`, `/api/charges/${chargeId}/pay`, { body: {} });
    if (result.ok && result.data) window.location.assign(result.data.url);
  }

  async function report(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = await action.run('report', '/api/me/repairs', { body: formValues(form) }, "Sent. Your landlord has been notified and you'll see the visit time here once it's set.");
    if (result.ok) {
      form.reset();
      reload();
    }
  }

  if (loading && !data) return <Loading />;
  if (!rental)
    return (
      <>
        <PageHeader eyebrow="Your rental" title="My home" />
        {error ? <Alert title="Couldn't load your rental">{error}</Alert> : <EmptyState title="No active lease">Your landlord hasn&apos;t linked a lease to this account yet, or your lease has ended.</EmptyState>}
      </>
    );

  const { home, lease, charges, repairs } = rental;
  const owed = charges.filter((c) => c.status !== 'paid' && c.status !== 'upcoming');
  const owedTotal = owed.reduce((sum, c) => sum + Number(c.amount) - Number(c.paidAmount), 0);
  const latest = charges[0];
  const openRepairs = repairs.filter((r) => r.status === 'open' || r.status === 'scheduled');
  const step = tenantStep({ agreement: rental.agreement, startDate: lease.startDate, today: new Date().toISOString().slice(0, 10) });

  return (
    <>
      <PageHeader eyebrow="Your rental" title={home.name} lead={[home.address, home.city, `${home.state} ${home.zip ?? ''}`.trim()].filter(Boolean).join(', ')} />
      <div className="grid gap-8">
        {step < ACTIVE_STEP && (
          <Panel title="Your move-in progress" description="Where you are, from your application to moving in.">
            <LeasingPath current={step} who={(i) => (i === 3 ? 'You sign' : 'You and your landlord')} />
            <div className="mt-5 rounded-lg bg-brand-50 p-4">
              {step === 3 && rental.agreement ? (
                <>
                  <p className="font-semibold text-ink">Next: read and sign your lease</p>
                  <p className="mt-1 text-ink-2">Your landlord has signed it. It takes about 5 minutes.</p>
                  <p className="mt-3">
                    <a href={`/agreements/${rental.agreement.id}`} className={buttonClass('primary')}>
                      Read and sign
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-ink">Next: move in on {formatDate(lease.startDate)}</p>
                  <p className="mt-1 text-ink-2">
                    Walk through the home with your landlord on move-in day. Note anything already damaged and take photos, so it isn&apos;t counted against your deposit when you move out.
                  </p>
                </>
              )}
            </div>
          </Panel>
        )}
        <Panel
          title="Rent"
          actions={owedTotal > 0 ? <Chip tone={owed.some((c) => c.status === 'late') ? 'danger' : 'new'}>{formatMoney(owedTotal)} due</Chip> : latest ? <Chip tone="live">All paid</Chip> : undefined}
          description={`${formatMoney(lease.monthlyRent)} a month, due on the ${ordinal(lease.dueDay)}. It counts as late after ${lease.graceDays} days.`}
        >
          {charges.length === 0 ? (
            <EmptyState>No rent has been added yet.</EmptyState>
          ) : (
            <DataTable
              caption="Your rent by month"
              rows={charges}
              rowKey={(c) => c.id}
              columns={[
                { header: 'Month', primary: true, cell: (c) => monthLabel(c.period) },
                { header: 'Due', cell: (c) => <When iso={c.dueDate} /> },
                { header: 'Rent', align: 'right', cell: (c) => formatMoney(c.amount) },
                { header: 'Paid', align: 'right', cell: (c) => formatMoney(c.paidAmount) },
                { header: 'Status', cell: (c) => <Chip tone={statusOf('rent', c.status).tone}>{statusOf('rent', c.status).label}</Chip> },
                {
                  header: 'Receipt or payment',
                  align: 'right',
                  cell: (c) =>
                    c.processing ? (
                      <Chip tone="info">{formatMoney(c.processing)} on its way</Chip>
                    ) : rental.onlinePayments && c.status !== 'paid' ? (
                      <Button size="sm" onClick={() => payOnline(c.id)} busy={pay.busy === `pay-${c.id}`} busyLabel="Opening…">
                        Pay {formatMoney(Number(c.amount) - Number(c.paidAmount))} by bank
                      </Button>
                    ) : Number(c.paidAmount) > 0 ? (
                      <TextLink href={`/receipts/${c.id}`}>View receipt</TextLink>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
          )}
          {pay.error && <div className="mt-4"><Alert>{pay.error}</Alert></div>}
          {paymentNote === 'sent' && (
            <div className="mt-4">
              <Alert tone="success" title="Payment started">
                Bank payments take about 4 business days. You&apos;ll get a receipt here once your bank confirms it.
              </Alert>
            </div>
          )}
          <p className="mt-4 text-sm text-muted">
            {rental.onlinePayments
              ? 'Pay by bank here, or pay your landlord the usual way. Your bank details go to Stripe, the payment company, not to Vrentals or your landlord.'
              : 'Pay your landlord the usual way. They record each payment here, and you get a receipt when they do.'}
          </p>
        </Panel>

        <Panel title="Report a repair" description="Tell your landlord what needs fixing. You'll be notified when a visit is scheduled.">
          <form onSubmit={report} noValidate className="grid gap-5">
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ title: 'What needs fixing' }} />
            <FieldRow>
              <TextField name="title" label="What needs fixing" required maxLength={200} hint='Like "Kitchen sink leaking".' errors={action.fieldErrors} />
              <SelectField name="urgency" label="How urgent is it?" options={REPAIR_URGENCIES} defaultValue="normal" errors={action.fieldErrors} />
            </FieldRow>
            <TextAreaField name="description" label="Details" rows={3} hint="Where it is, when it started, and good times for someone to come by." errors={action.fieldErrors} />
            <Alert tone="info">For a fire, gas smell or other emergency, call 911 first.</Alert>
            <div>
              <Button type="submit" busy={action.busy === 'report'} busyLabel="Sending…">
                Send to landlord
              </Button>
            </div>
          </form>
        </Panel>

        <section>
          <h2 className="font-display mb-3 text-xl font-semibold text-ink">Your repairs</h2>
          {repairs.length === 0 ? (
            <EmptyState>Nothing reported yet.</EmptyState>
          ) : (
            <ul className="grid gap-3">
              {[...openRepairs, ...repairs.filter((r) => !openRepairs.includes(r))].map((r) => {
                const s = statusOf('repair', r.status);
                return (
                  <li key={r.id} className="rounded-lg border border-line bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{r.title}</p>
                        <p className="mt-1 text-sm text-muted">
                          Reported <When iso={r.createdAt} />
                          {r.status === 'done' && r.completedAt && (
                            <>
                              {' · '}Fixed <When iso={r.completedAt} />
                            </>
                          )}
                        </p>
                      </div>
                      <Chip tone={s.tone}>{s.label}</Chip>
                    </div>
                    {r.status === 'scheduled' && r.appointmentAt && (
                      <p className="mt-3 rounded-md bg-brand-50 px-3 py-2 text-ink">
                        Visit: <strong><When iso={r.appointmentAt} withTime /></strong>
                        {r.vendorName && <> with {r.vendorName}</>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Panel
          title="Your lease"
          actions={rental.agreement ? <Chip tone={rental.agreement.status === 'signed' ? 'live' : 'warning'}>{rental.agreement.status === 'signed' ? 'Signed' : 'Needs your signature'}</Chip> : undefined}
        >
          <DetailList
            items={[
              { label: 'Monthly rent', value: formatMoney(lease.monthlyRent) },
              { label: 'Due', value: `${ordinal(lease.dueDay)} of each month` },
              { label: 'Lease started', value: <When iso={lease.startDate} /> },
              { label: 'Lease ends', value: <When iso={lease.endDate} empty="Month to month" /> },
              { label: 'Late fee', value: lease.lateFee ? formatMoney(lease.lateFee) : 'None' },
              { label: 'Security deposit', value: formatMoney(lease.securityDeposit) },
            ]}
          />
          {rental.agreement && (
            <p className="mt-6">
              <TextLink href={`/agreements/${rental.agreement.id}`}>{rental.agreement.status === 'signed' ? 'View your signed lease' : 'Read and sign your lease'}</TextLink>
            </p>
          )}
          {rental.landlord && (
            <div className="mt-6 border-t border-line pt-6">
              <p className="font-medium text-ink">Your landlord{rental.landlord.name ? `: ${rental.landlord.name}` : ''}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                <a href={`mailto:${rental.landlord.email}`} className="link">{rental.landlord.email}</a>
                {rental.landlord.phone && <a href={`tel:${rental.landlord.phone.replace(/[^\d+]/g, '')}`} className="link">{rental.landlord.phone}</a>}
              </p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
