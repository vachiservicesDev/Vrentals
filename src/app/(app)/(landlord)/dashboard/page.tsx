'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formValues, useAction, useResource } from '@/lib/client/api';
import { REMINDER_KINDS, labelFrom, statusOf } from '@/lib/status';
import { STATE_OPTIONS } from '@/lib/rentals/states';
import { Button } from '@/components/ui/Button';
import { FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { PROPERTY_USES } from '@/lib/rentals/homeowner';
import { FormStatus } from '@/components/ui/forms';
import { StepForm } from '@/components/ui/StepForm';
import { Alert, Chip, DataTable, EmptyState, Loading, PageHeader, Panel, StatCard, When, formatMoney } from '@/components/ui/ui';

interface Home {
  id: string;
  name: string;
  address: string;
  city: string | null;
  tenantName: string | null;
  monthlyRent: string | null;
  leaseEnds: string | null;
  use: 'rental' | 'own';
}

interface Overview {
  kind: 'landlord' | 'homeowner';
  homes: number;
  occupied: number;
  month: string;
  expected: string;
  collected: string;
  behind: { chargeId: string; propertyId: string; home: string; tenantName: string; period: string; dueDate: string; owed: string }[];
  repairs: { id: string; propertyId: string; home: string; title: string; urgency: string; status: string; appointmentAt: string | null; createdAt: string }[];
  reminders: { id: string; propertyId: string; home: string; kind: string; title: string; amount: string | null; dueDate: string }[];
}

const monthLabel = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function DashboardPage() {
  const overview = useResource<Overview>('/api/overview');
  const homes = useResource<{ properties: Home[] }>('/api/properties');
  const action = useAction();
  const rentAction = useAction();
  const [addKey, setAddKey] = useState(0);
  const o = overview.data;
  const list = homes.data?.properties ?? [];

  async function addHome(form: HTMLFormElement) {
    const values = formValues(form);
    const done = values.use === 'own' ? 'Home added. Open it to add your mortgage, tax and other payments.' : 'Home added. Open it to add the tenant and lease.';
    const result = await action.run('add', '/api/properties', { body: values }, done);
    if (result.ok) {
      setAddKey((k) => k + 1);
      homes.reload();
      overview.reload();
    }
  }

  async function addRent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const month = String(new FormData(e.currentTarget).get('month') ?? '');
    const result = await rentAction.run<{ created: number; skipped: number }>('rent', '/api/charges/generate', { body: { month } });
    if (result.ok && result.data) {
      const { created, skipped } = result.data;
      rentAction.setSuccess(
        created === 0 && skipped === 0
          ? 'No active leases cover that month.'
          : `Added rent for ${created} ${created === 1 ? 'home' : 'homes'}${skipped ? `; ${skipped} already had it` : ''}.`,
      );
      overview.reload();
    }
  }

  const thisMonth = o?.month.slice(0, 7) ?? '';
  const behindTotal = (o?.behind ?? []).reduce((sum, b) => sum + Number(b.owed), 0);
  // Someone who only tracks the home they live in has no rent to collect.
  const homeowner = o?.kind === 'homeowner';
  const onlyOwn = list.length > 0 ? list.every((h) => h.use === 'own') : homeowner;
  const anyOwn = list.some((h) => h.use === 'own');

  // Wait for the overview: until then we don't know if this is a homeowner, and the rent cards would flash.
  if (!o && overview.loading) return <Loading label="Loading your dashboard" />;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={onlyOwn ? 'Your home' : 'Your rentals'}
        lead={onlyOwn ? 'Payments, repairs, insurance, HOA and your year-end tax summary in one place.' : 'Rent, repairs, insurance and HOA for your homes in one place.'}
        actions={anyOwn ? <Link href="/reports/home" className="font-semibold text-brand-700 hover:underline">Homeowner tax summary</Link> : undefined}
      />
      <div className="grid gap-8">
        {overview.error && <Alert title="Couldn't load the overview">{overview.error}</Alert>}
        <section aria-label="This month">
          <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${onlyOwn ? '' : 'xl:grid-cols-4'}`}>
            {!onlyOwn && (
              <>
                <StatCard
                  href="#rent"
                  value={o ? formatMoney(o.collected) : '–'}
                  label={o ? `Collected for ${monthLabel(o.month)}` : 'Collected this month'}
                  hint={o ? `of ${formatMoney(o.expected)} expected` : undefined}
                />
                <StatCard href="#behind" value={o ? o.behind.length : '–'} label="Behind on rent" hint={o && behindTotal ? `${formatMoney(behindTotal)} owed` : 'Everyone is up to date.'} tone={o?.behind.length ? 'danger' : undefined} />
              </>
            )}
            <StatCard href="#repairs" value={o ? o.repairs.length : '–'} label="Open repairs" hint="Reported and not fixed yet." tone={o?.repairs.some((r) => r.urgency === 'urgent' && r.status === 'open') ? 'warning' : undefined} />
            <StatCard href="#reminders" value={o ? o.reminders.length : '–'} label="Bills due in 30 days" hint="Insurance, HOA, tax and more." tone={o?.reminders.some((r) => r.dueDate < new Date().toISOString().slice(0, 10)) ? 'warning' : undefined} />
          </ul>
        </section>

        {!onlyOwn && (
          <>
            <Panel id="rent" title="Add a month's rent" description="Adds the rent to every active lease for that month. Running it again never charges twice.">
              <form onSubmit={addRent} noValidate className="grid gap-5">
                <FormStatus error={rentAction.error} success={rentAction.success} fieldErrors={rentAction.fieldErrors} labels={{ month: 'Month' }} />
                <div className="flex flex-wrap items-end gap-4">
                  <label className="grid gap-1.5">
                    <span className="font-medium text-ink">Month</span>
                    <input key={thisMonth} type="month" name="month" defaultValue={thisMonth} required className="min-h-11 rounded-md border border-line-input bg-white px-3 text-ink focus:border-accent-600" />
                  </label>
                  <Button type="submit" busy={rentAction.busy === 'rent'} busyLabel="Adding…">
                    Add rent
                  </Button>
                </div>
              </form>
            </Panel>

            <section id="behind">
              <h2 className="font-display mb-3 text-xl font-semibold text-ink">Behind on rent</h2>
              {overview.loading && !o ? (
                <Loading />
              ) : !o?.behind.length ? (
                <EmptyState>Nobody is behind. Rent counts as late once the grace period after the due date has passed.</EmptyState>
              ) : (
                <DataTable
                  caption="Tenants behind on rent"
                  rows={o.behind}
                  rowKey={(b) => b.chargeId}
                  columns={[
                    { header: 'Tenant', primary: true, cell: (b) => <Link href={`/homes/${b.propertyId}`} className="font-semibold text-brand-700 hover:underline">{b.tenantName}</Link> },
                    { header: 'Home', cell: (b) => b.home },
                    { header: 'Month', cell: (b) => monthLabel(b.period) },
                    { header: 'Was due', cell: (b) => <When iso={b.dueDate} /> },
                    { header: 'Still owed', align: 'right', cell: (b) => <span className="font-semibold text-danger-700">{formatMoney(b.owed)}</span> },
                  ]}
                />
              )}
            </section>
          </>
        )}

        <section id="repairs">
          <h2 className="font-display mb-3 text-xl font-semibold text-ink">Repairs to handle</h2>
          {overview.loading && !o ? (
            <Loading />
          ) : !o?.repairs.length ? (
            <EmptyState>No open repairs.</EmptyState>
          ) : (
            <DataTable
              caption="Open repairs"
              rows={o.repairs}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Repair', primary: true, cell: (r) => <Link href={`/homes/${r.propertyId}#repairs`} className="font-semibold text-brand-700 hover:underline">{r.title}</Link> },
                { header: 'Home', cell: (r) => r.home },
                { header: 'Urgency', cell: (r) => <Chip tone={statusOf('repairUrgency', r.urgency).tone}>{statusOf('repairUrgency', r.urgency).label}</Chip> },
                { header: 'Status', cell: (r) => <Chip tone={statusOf('repair', r.status).tone}>{statusOf('repair', r.status).label}</Chip> },
                { header: 'Visit', cell: (r) => <When iso={r.appointmentAt} withTime empty="Not set" /> },
              ]}
            />
          )}
        </section>

        <section id="reminders">
          <h2 className="font-display mb-3 text-xl font-semibold text-ink">Bills and renewals coming up</h2>
          {overview.loading && !o ? (
            <Loading />
          ) : !o?.reminders.length ? (
            <EmptyState>Nothing due in the next 30 days. Add insurance, HOA and tax reminders on each home&apos;s page.</EmptyState>
          ) : (
            <DataTable
              caption="Reminders due soon"
              rows={o.reminders}
              rowKey={(r) => r.id}
              columns={[
                { header: 'Reminder', primary: true, cell: (r) => <Link href={`/homes/${r.propertyId}#reminders`} className="font-semibold text-brand-700 hover:underline">{r.title}</Link> },
                { header: 'Home', cell: (r) => r.home },
                { header: 'Type', cell: (r) => labelFrom(REMINDER_KINDS, r.kind) },
                { header: 'Amount', align: 'right', cell: (r) => formatMoney(r.amount) },
                { header: 'Due', cell: (r) => <When iso={r.dueDate} /> },
              ]}
            />
          )}
        </section>

        <section>
          <h2 className="font-display mb-3 text-xl font-semibold text-ink">Your homes</h2>
          {homes.error && <Alert title="Couldn't load your homes">{homes.error}</Alert>}
          {homes.loading && !homes.data ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState title="No homes yet">Add your first home below.</EmptyState>
          ) : (
            <DataTable
              caption="Rental homes"
              rows={list}
              rowKey={(h) => h.id}
              columns={[
                { header: 'Home', primary: true, cell: (h) => <Link href={`/homes/${h.id}`} className="font-semibold text-brand-700 hover:underline">{h.name}</Link> },
                { header: 'Address', cell: (h) => [h.address, h.city].filter(Boolean).join(', ') },
                { header: 'Tenant', cell: (h) => (h.use === 'own' ? <Chip tone="info">You live here</Chip> : h.tenantName ?? <Chip tone="new">Vacant</Chip>) },
                { header: 'Rent', align: 'right', cell: (h) => formatMoney(h.monthlyRent) },
                { header: 'Lease ends', cell: (h) => <When iso={h.leaseEnds} empty={h.tenantName ? 'Month to month' : '—'} /> },
              ]}
            />
          )}
        </section>

        <Panel
          // A new account starts here: the form comes first until there's a home.
          className={homes.data && list.length === 0 ? 'order-first' : ''}
          title={onlyOwn && list.length === 0 ? 'Add your home' : 'Add a home'} description={list.length === 0 ? 'Two short steps. You can change any of this later.' : undefined}>
          {action.success && (
            <div className="mb-5">
              <FormStatus success={action.success} />
            </div>
          )}
          <StepForm
            // Start again after each home added, and once we know if this is a homeowner (the default home use).
            key={`${addKey}-${homeowner}`}
            onSubmit={addHome}
            submitLabel="Add home"
            busy={action.busy === 'add'}
            busyLabel="Adding…"
            fieldErrors={action.fieldErrors}
            status={<FormStatus error={action.error} fieldErrors={action.fieldErrors} labels={{ name: 'Name', address: 'Street address', city: 'City', state: 'State', zip: 'ZIP code' }} />}
            steps={[
              {
                title: 'The home',
                hint: 'What you call it and where it is.',
                content: (
                  <>
                    <SelectField name="use" label="How do you use this home?" options={[...PROPERTY_USES]} defaultValue={homeowner ? 'own' : 'rental'} hint="Pick “I live here” to track your own home's payments, repairs and year-end taxes." id="f-add-use" />
                    <FieldRow>
                      <TextField name="name" label="Name" required hint='What you call it, like "Unit 12" or "Our house".' errors={action.fieldErrors} maxLength={150} />
                      <TextField name="address" label="Street address" required errors={action.fieldErrors} autoComplete="street-address" />
                    </FieldRow>
                    <FieldRow cols={3}>
                      <TextField name="city" label="City" defaultValue="Danbury" errors={action.fieldErrors} />
                      <SelectField name="state" label="State" options={STATE_OPTIONS} defaultValue="CT" errors={action.fieldErrors} />
                      <TextField name="zip" label="ZIP code" inputMode="numeric" errors={action.fieldErrors} />
                    </FieldRow>
                  </>
                ),
              },
              {
                title: 'HOA',
                hint: 'If the home has a homeowners association. Skip this if not.',
                content: (
                  <FieldRow>
                    <TextField name="hoaName" label="HOA name" errors={action.fieldErrors} />
                    <TextAreaField name="hoaContact" label="HOA contact" rows={2} hint="Manager, phone, email, portal." errors={action.fieldErrors} />
                  </FieldRow>
                ),
              },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
