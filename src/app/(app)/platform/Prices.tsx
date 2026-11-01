'use client';

import { useState } from 'react';
import { useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { CheckboxField, FieldRow, SelectField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, EmptyState, Loading, Panel, When } from '@/components/ui/ui';

interface PricePlan {
  id: string;
  name: string;
  kind: string;
  homeLimit: number | null;
  months: number;
  price: string;
  description: string | null;
  isActive: boolean;
}

interface Payment {
  id: string;
  planName: string;
  email: string;
  fullName: string | null;
  amount: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const money = (v: string) => `$${Number(v).toFixed(2).replace(/\.00$/, '')}`;
const term = (months: number) => (months === 1 ? '1 month' : months === 12 ? '1 year' : `${months} months`);

/** Online payment: whether it's switched on, the prices on /pricing, and the payments that came in. */
export function Prices() {
  const prices = useResource<{ plans: PricePlan[]; billing: { configured: boolean; stripeKey: boolean; webhookSecret: boolean } }>('/api/platform/prices');
  const payments = useResource<{ payments: Payment[] }>('/api/platform/payments');
  const [editing, setEditing] = useState<PricePlan | 'new' | null>(null);
  if (prices.loading) return <Loading />;
  if (prices.error || !prices.data) return <Alert>{prices.error ?? 'Not found'}</Alert>;
  const { plans, billing } = prices.data;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <>
      <Panel
        title="Online payment"
        description="People can pay on your pricing page. After the payment goes through they get a sign-up link with a paid license, and you get a notification."
        actions={
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            Add a price
          </Button>
        }
      >
        {!billing.configured && (
          <div className="mb-5">
            <Alert tone="info" title="Online payment is off until Stripe is connected">
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>{billing.stripeKey ? 'Stripe secret key: set.' : 'In Vercel, add STRIPE_SECRET_KEY (from Stripe, Developers, API keys).'}</li>
                <li>
                  In Stripe, Developers, Webhooks, add an endpoint for <code className="break-all">{origin}/api/stripe/billing</code> with the events checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed and checkout.session.expired.
                </li>
                <li>{billing.webhookSecret ? 'Webhook secret: set.' : "In Vercel, add that endpoint's signing secret as STRIPE_BILLING_WEBHOOK_SECRET, then redeploy."}</li>
                <li>In Stripe, Settings, Payouts, link the bank account the money should go to.</li>
              </ol>
            </Alert>
          </div>
        )}
        <p className="mb-4 text-ink-2">
          Pricing page: <a href="/pricing" className="link break-all">{origin}/pricing</a>
        </p>
        {editing && <PriceForm key={editing === 'new' ? 'new' : editing.id} plan={editing === 'new' ? null : editing} onDone={() => { setEditing(null); prices.reload(); }} onCancel={() => setEditing(null)} />}
        {plans.length === 0 ? (
          <EmptyState>No prices yet. Add one, and it shows on the pricing page.</EmptyState>
        ) : (
          <DataTable
            caption="Prices"
            rows={plans}
            rowKey={(p) => p.id}
            columns={[
              { header: 'Plan', primary: true, cell: (p) => <span>{p.name}{p.description && <span className="block text-sm font-normal text-muted">{p.description}</span>}</span> },
              { header: 'Type', cell: (p) => (p.kind === 'homeowner' ? 'Homeowner' : 'Landlord') },
              { header: 'Homes', cell: (p) => (p.homeLimit === null ? 'Unlimited' : String(p.homeLimit)) },
              { header: 'Price', cell: (p) => `${money(p.price)} for ${term(p.months)}` },
              { header: 'Status', cell: (p) => (p.isActive ? <Chip tone="live">Offered</Chip> : <Chip tone="muted">Hidden</Chip>) },
              { header: 'Actions', align: 'right', cell: (p) => <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>Change</Button> },
            ]}
          />
        )}
      </Panel>

      {(payments.data?.payments.length ?? 0) > 0 && (
        <Panel title="Payments" description="Online payments for plans. Bank transfers you receive yourself: mark the account Paid under Accounts and licenses.">
          <DataTable
            caption="Payments"
            rows={payments.data!.payments}
            rowKey={(p) => p.id}
            columns={[
              { header: 'Who', primary: true, cell: (p) => <span>{p.fullName || p.email}<span className="block text-sm font-normal text-muted">{p.email}</span></span> },
              { header: 'Plan', cell: (p) => p.planName },
              { header: 'Amount', cell: (p) => money(p.amount) },
              { header: 'Status', cell: (p) => (p.status === 'paid' ? <Chip tone="live">Paid</Chip> : p.status === 'processing' ? <Chip tone="info">Bank payment pending</Chip> : <Chip tone="danger">Failed</Chip>) },
              { header: 'When', cell: (p) => <When iso={p.paidAt ?? p.createdAt} /> },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

function PriceForm({ plan, onDone, onCancel }: { plan: PricePlan | null; onDone: () => void; onCancel: () => void }) {
  const action = useAction();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      kind: String(fd.get('kind') ?? 'landlord'),
      homeLimit: String(fd.get('homeLimit') ?? '').trim(),
      months: String(fd.get('months') ?? '1'),
      price: String(fd.get('price') ?? '').trim(),
      description: String(fd.get('description') ?? '').trim(),
      isActive: fd.get('isActive') === 'on',
    };
    const result = await action.run('save', plan ? `/api/platform/prices/${plan.id}` : '/api/platform/prices', { method: plan ? 'PATCH' : 'POST', body });
    if (result.ok) onDone();
  }
  return (
    <form onSubmit={save} noValidate className="mb-6 grid gap-5 rounded-lg border border-line bg-subtle p-4">
      <h3 className="font-semibold text-ink">{plan ? `Change ${plan.name}` : 'New price'}</h3>
      <FormStatus error={action.error} fieldErrors={action.fieldErrors} labels={{ name: 'Plan name', homeLimit: 'Homes allowed', months: 'Length', price: 'Price' }} />
      <FieldRow>
        <TextField name="name" label="Plan name" required defaultValue={plan?.name} hint="For example: Landlord Basic." errors={action.fieldErrors} />
        <SelectField name="kind" label="For" options={[{ value: 'landlord', label: 'Landlords' }, { value: 'homeowner', label: 'Homeowners' }]} defaultValue={plan?.kind ?? 'landlord'} />
      </FieldRow>
      <FieldRow cols={3}>
        <TextField name="price" label="Price ($)" type="number" inputMode="decimal" min={1} step="0.01" required defaultValue={plan?.price} errors={action.fieldErrors} />
        <SelectField
          name="months"
          label="Length"
          options={[
            { value: '1', label: '1 month' },
            { value: '3', label: '3 months' },
            { value: '6', label: '6 months' },
            { value: '12', label: '1 year' },
          ]}
          defaultValue={String(plan?.months ?? 1)}
        />
        <TextField name="homeLimit" label="Homes allowed" type="number" min={1} defaultValue={plan?.homeLimit ?? ''} hint="Blank for unlimited." errors={action.fieldErrors} />
      </FieldRow>
      <TextField name="description" label="Short description" defaultValue={plan?.description ?? ''} hint="Shown on the pricing page." errors={action.fieldErrors} />
      <CheckboxField name="isActive" label="Show on the pricing page" defaultChecked={plan?.isActive ?? true} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
          Save price
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
