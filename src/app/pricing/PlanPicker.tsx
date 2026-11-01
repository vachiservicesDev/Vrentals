'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';

export interface PublicPlan {
  id: string;
  name: string;
  kind: string;
  homeLimit: number | null;
  months: number;
  price: string;
  description: string | null;
}

const term = (months: number) => (months === 1 ? 'month' : months === 12 ? 'year' : `${months} months`);
const money = (v: string) => `$${Number(v).toFixed(2).replace(/\.00$/, '')}`;

/** Step 1: pick a plan. Step 2: name and email (skipped when signed in), then off to Stripe to pay. */
export function PlanPicker({ plans, account }: { plans: PublicPlan[]; account: { email: string; name: string } | null }) {
  const [chosen, setChosen] = useState<PublicPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: chosen.id, email: String(fd.get('email') ?? account?.email ?? ''), fullName: String(fd.get('fullName') ?? account?.name ?? '') }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && data.url) {
      window.location.assign(data.url);
      return;
    }
    setBusy(false);
    setFieldErrors(Object.fromEntries(Object.entries((data.errors?.fieldErrors ?? {}) as Record<string, string[]>).map(([k, v]) => [k, v[0]])));
    setError(res ? data.message === 'Invalid input' ? 'Check the fields below.' : data.message || 'Something went wrong. Try again.' : "Couldn't reach Vrentals. Check your connection and try again.");
  }

  return (
    <div className="grid gap-8">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const picked = chosen?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setChosen(p)}
                aria-pressed={picked}
                className={`flex h-full w-full flex-col gap-2 rounded-lg border bg-white p-5 text-left shadow-[var(--shadow-panel)] ${picked ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-line hover:border-brand-600'}`}
              >
                <span className="text-sm font-semibold uppercase tracking-wide text-accent-700">{p.kind === 'homeowner' ? 'Homeowner' : 'Landlord'}</span>
                <span className="font-display text-xl font-semibold text-ink">{p.name}</span>
                <span className="text-ink">
                  <span className="text-3xl font-semibold">{money(p.price)}</span> <span className="text-muted">per {term(p.months)}</span>
                </span>
                <span className="text-ink-2">{p.homeLimit === null ? 'Unlimited homes' : `Up to ${p.homeLimit} ${p.homeLimit === 1 ? 'home' : 'homes'}`}</span>
                {p.description && <span className="text-sm text-muted">{p.description}</span>}
                <span className={`mt-auto pt-2 text-sm font-semibold ${picked ? 'text-brand-700' : 'text-ink-2'}`}>{picked ? 'Selected' : 'Choose this plan'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen && (
        <form onSubmit={pay} noValidate className="mx-auto grid w-full max-w-md gap-5 rounded-lg border border-line bg-white p-6 shadow-[var(--shadow-panel)]">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{chosen.name}</h2>
            <p className="text-ink-2">
              {money(chosen.price)} for {chosen.months === 1 ? '1 month' : `${chosen.months} months`}. You pay once; it doesn&apos;t renew by itself.
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-danger-700/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700">
              {error}
            </p>
          )}
          {account ? (
            <p className="text-ink-2">
              For your account, <span className="font-medium text-ink">{account.email}</span>.
            </p>
          ) : (
            <>
              <TextField name="fullName" label="Your name" required hideOptional autoComplete="name" errors={fieldErrors} />
              <TextField name="email" label="Email" type="email" required hideOptional autoComplete="email" inputMode="email" hint="We send your sign-up link here." errors={fieldErrors} />
            </>
          )}
          <Button type="submit" size="lg" busy={busy} busyLabel="Opening payment…" className="w-full">
            Pay {money(chosen.price)}
          </Button>
          <p className="text-center text-sm text-muted">You pay on Stripe&apos;s secure page. Vrentals never sees your card or bank details.</p>
        </form>
      )}
    </div>
  );
}
