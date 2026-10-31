'use client';

import { useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FormStatus } from '@/components/ui/forms';
import { Chip, Panel } from '@/components/ui/ui';

interface Status {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  isOwner: boolean;
}

/** Online rent: the owner connects their own Stripe account, and tenants can then pay by bank. */
export function PaymentsPanel() {
  const status = useResource<Status>('/api/stripe/connect');
  const action = useAction();
  const s = status.data;

  async function connect() {
    const result = await action.run<{ url: string }>('connect', '/api/stripe/connect', { method: 'POST', body: {} });
    if (result.ok && result.data) window.location.assign(result.data.url);
  }

  return (
    <Panel
      id="payments"
      title="Online rent payments"
      description="Let tenants pay rent from their bank account (ACH) in Vrentals. Payments go through Stripe straight into your bank. Tenants type their bank details on Stripe's secure page only; Vrentals never sees or stores them. Stripe charges 0.8% per payment, at most $5, taken from the payment."
      actions={s ? s.configured && s.enabled ? <Chip tone="live">On</Chip> : s.configured && s.connected ? <Chip tone="warning">Setup not finished</Chip> : <Chip tone="muted">Off</Chip> : undefined}
    >
      <div className="grid gap-4">
        <FormStatus error={action.error ?? status.error} success={action.success} />
        {s && !s.configured && <p className="text-muted">Online payments aren&apos;t switched on for Vrentals yet.</p>}
        {s?.configured && s.enabled && (
          <p className="text-ink">
            Your tenants see a &quot;Pay by bank&quot; button for rent they owe. Payouts, fees and refunds are in your{' '}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener" className="link">
              Stripe dashboard
            </a>
            .
          </p>
        )}
        {s?.configured && !s.enabled && s.isOwner && (
          <>
            <p className="text-ink">
              {s.connected
                ? 'Stripe still needs some details before you can take payments. Pick up where you left off.'
                : "You'll create or sign in to a Stripe account and add the bank account rent should go to. Stripe asks for your name, address, the last 4 of your SSN or your EIN, and your bank. It takes about 10 minutes."}
            </p>
            <div>
              <Button onClick={connect} busy={action.busy === 'connect'} busyLabel="Opening Stripe…">
                {s.connected ? 'Finish Stripe setup' : 'Set up with Stripe'}
              </Button>
            </div>
          </>
        )}
        {s?.configured && !s.enabled && !s.isOwner && <p className="text-muted">The owner of these homes can switch this on from their account page.</p>}
      </div>
    </Panel>
  );
}
