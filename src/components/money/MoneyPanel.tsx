'use client';

import { useState } from 'react';
import { api, formValues, useAction, useResource } from '@/lib/client/api';
import { CATEGORIES, PAID_FROM, TRANSACTION_TYPES, categoryOf, type Category, type TransactionType } from '@/lib/rentals/money';
import { HOME_CAPITAL_CATEGORIES, HOME_EXPENSE_CATEGORIES, HOME_TRANSACTION_TYPES, homeCategoryOf, type HomeCategory } from '@/lib/rentals/homeowner';
import { Button, LinkButton } from '@/components/ui/Button';
import { FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, EmptyState, Panel, When, formatMoney } from '@/components/ui/ui';

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  date: string;
  amount: string;
  payee: string | null;
  paidFrom: string;
  description: string | null;
  sourceType: string | null;
  receipt?: { id: string; name: string; fileName: string } | null;
}

interface Summary {
  statement: { totalIncome: number; totalExpenses: number; net: number; paidPersonally: number; deposits: { held: number } };
}

interface HomeSummary {
  combined: { totalSpending: number; totalScheduleA: number; totalImprovementsThisYear: number; basis: { adjusted: number | null } } | null;
}

const TYPE_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', capital: 'Improvement', deposit: 'Deposit' };

/** A rental files under Schedule E; a home you live in has its own payment and improvement categories. */
export function catalog(own: boolean) {
  return {
    types: own ? [...HOME_TRANSACTION_TYPES] : [...TRANSACTION_TYPES],
    categoryOf: (type: string, category: string): Category | HomeCategory | undefined => (own ? homeCategoryOf(type, category) : categoryOf(type, category)),
    options: (type: TransactionType) =>
      own
        ? (type === 'capital' ? HOME_CAPITAL_CATEGORIES : HOME_EXPENSE_CATEGORIES).map((c) => ({ value: c.value, label: c.form ? `${c.label} (${c.form})` : c.label }))
        : CATEGORIES[type].map((c) => ({ value: c.value, label: c.line ? `${c.label} (Sch. E line ${c.line})` : c.label })),
  };
}

/** A home's money for this year: totals, every entry, and a form to add one. */
export function MoneyPanel({ propertyId, reloadKey, own = false }: { propertyId: string; reloadKey: string; own?: boolean }) {
  const year = new Date().getFullYear();
  const range = `from=${year}-01-01&to=${year}-12-31`;
  const list = useResource<{ transactions: Transaction[] }>(`/api/properties/${propertyId}/transactions?${range}&k=${reloadKey}`);
  const summary = useResource<Summary>(own ? null : `/api/reports/pnl?property=${propertyId}&${range}&k=${reloadKey}`);
  const homeSummary = useResource<HomeSummary>(own ? `/api/reports/home?property=${propertyId}&year=${year}&k=${reloadKey}` : null);
  const cat = catalog(own);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const reload = () => {
    list.reload();
    if (own) homeSummary.reload();
    else summary.reload();
  };

  async function remove(t: Transaction) {
    if (!window.confirm(`Delete this ${TYPE_LABEL[t.type].toLowerCase()} of ${formatMoney(t.amount)}?`)) return;
    setRowError(null);
    const result = await api(`/api/transactions/${t.id}`, { method: 'DELETE' });
    if (!result.ok) setRowError(result.message);
    else reload();
  }

  const s = summary.data?.statement;
  const h = homeSummary.data?.combined;
  const rows = list.data?.transactions ?? [];
  return (
    <Panel
      id="money"
      title={`Money in ${year}`}
      description={
        own
          ? 'Add your mortgage, property tax, insurance, bills, repairs and improvements here. At year end they become your tax summary.'
          : 'Rent you record above counts automatically. Add every other cost and payment here; each one is filed under its IRS Schedule E line.'
      }
      actions={
        own ? (
          <LinkButton href={`/reports/home?property=${propertyId}&year=${year}`} variant="secondary" size="sm" arrow>
            Tax summary
          </LinkButton>
        ) : (
          <LinkButton href={`/reports?property=${propertyId}`} variant="secondary" size="sm" arrow>
            Profit &amp; loss
          </LinkButton>
        )
      }
    >
      <div className="grid gap-6">
        {own && h && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Paid this year" value={formatMoney(h.totalSpending)} />
            <Figure label="Deductible if you itemize" value={formatMoney(h.totalScheduleA)} hint="Schedule A" />
            <Figure label="Improvements" value={formatMoney(h.totalImprovementsThisYear)} hint="Add to cost basis" />
            <Figure label="Cost basis" value={h.basis.adjusted === null ? '—' : formatMoney(h.basis.adjusted)} hint={h.basis.adjusted === null ? 'Add the purchase price below' : 'Price plus improvements'} />
          </dl>
        )}
        {!own && s && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Figure label="Income" value={formatMoney(s.totalIncome)} />
            <Figure label="Expenses" value={formatMoney(s.totalExpenses)} />
            <Figure label="Net" value={formatMoney(s.net)} tone={s.net < 0 ? 'danger' : undefined} />
            <Figure label="Paid personally" value={formatMoney(s.paidPersonally)} hint="Owed back to you" />
          </dl>
        )}
        {rowError && <Alert>{rowError}</Alert>}
        {list.error && <Alert>{list.error}</Alert>}
        {rows.length === 0 ? (
          <EmptyState>{own ? 'Nothing recorded yet this year.' : 'No expenses or other income yet this year.'}</EmptyState>
        ) : (
          <DataTable
            caption={`Money entries for ${year}`}
            rows={rows}
            rowKey={(t) => t.id}
            columns={[
              {
                header: 'What',
                primary: true,
                cell: (t) => (
                  <span>
                    {cat.categoryOf(t.type, t.category)?.label ?? t.category}
                    <span className="block text-sm font-normal text-muted">{[t.payee, t.description].filter(Boolean).join(' · ') || TYPE_LABEL[t.type]}</span>
                    {t.receipt && (
                      <a href={`/api/documents/${t.receipt.id}`} target="_blank" rel="noopener" className="link block text-sm font-normal">
                        Receipt: {t.receipt.fileName}
                      </a>
                    )}
                  </span>
                ),
              },
              { header: 'Date', cell: (t) => <When iso={t.date} /> },
              {
                header: 'Type',
                cell: (t) => (
                  <span className="inline-flex flex-wrap gap-1.5">
                    <Chip tone={t.type === 'income' ? 'live' : t.type === 'deposit' ? 'info' : t.type === 'capital' ? 'warning' : 'draft'}>{TYPE_LABEL[t.type]}</Chip>
                    {!own && (t.type === 'expense' || t.type === 'capital') && t.paidFrom === 'personal' && <Chip tone="new">Personal</Chip>}
                  </span>
                ),
              },
              { header: 'Amount', align: 'right', cell: (t) => <span className={t.type === 'income' ? 'font-semibold text-ink' : ''}>{formatMoney(t.amount)}</span> },
              {
                header: 'Actions',
                align: 'right',
                cell: (t) =>
                  t.sourceType === 'repair' ? (
                    <span className="text-sm text-muted">From a repair</span>
                  ) : (
                    <span className="inline-flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                        Delete
                      </Button>
                    </span>
                  ),
              },
            ]}
          />
        )}
        {editing ? (
          <div className="rounded-lg border border-line p-4">
            <TransactionForm
              key={editing.id}
              url={`/api/transactions/${editing.id}`}
              method="PATCH"
              initial={editing}
              own={own}
              title="Edit entry"
              onDone={() => {
                setEditing(null);
                reload();
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <details className="rounded-lg border border-line" open={rows.length === 0}>
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">{own ? 'Add a payment or improvement' : 'Add an expense or income'}</summary>
            <div className="border-t border-line p-4">
              <TransactionForm url={`/api/properties/${propertyId}/transactions`} method="POST" own={own} onDone={reload} />
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-md bg-subtle p-3">
      <dt className="t-label text-muted">{label}</dt>
      <dd className={`mt-1 font-display text-xl font-semibold ${tone === 'danger' ? 'text-danger-700' : 'text-ink'}`}>{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function TransactionForm({
  url,
  method,
  initial,
  own = false,
  title,
  onDone,
  onCancel,
}: {
  url: string;
  method: 'POST' | 'PATCH';
  initial?: Transaction;
  own?: boolean;
  title?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const action = useAction();
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [category, setCategory] = useState(initial?.category ?? '');
  const cat = catalog(own);
  const hint = cat.categoryOf(type, category)?.hint;
  // A home you live in has no business account, so there's nothing to split.
  const spends = !own && (type === 'expense' || type === 'capital');

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = formValues(form);
    // Editing sends the whole entry, so a cleared note or payee is cleared.
    const body = method === 'PATCH' ? { payee: '', description: '', ...values } : values;
    const result = await action.run('save', url, { method, body }, method === 'POST' ? 'Saved.' : undefined);
    if (!result.ok) return;
    if (method === 'POST') {
      form.reset();
      setCategory('');
    }
    onDone();
  }

  const fid = (name: string) => `f-tx-${name}-${initial?.id ?? 'new'}`;
  return (
    <form onSubmit={save} noValidate className="grid gap-5">
      {title && <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>}
      <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ type: 'Kind', category: 'Category', date: 'Date', amount: 'Amount' }} />
      <FieldRow cols={3}>
        <SelectField
          name="type"
          label="Kind"
          required
          options={cat.types}
          value={type}
          onChange={(e) => {
            setType(e.target.value as TransactionType);
            setCategory('');
          }}
          id={fid('type')}
        />
        <SelectField
          name="category"
          label="Category"
          required
          placeholder="Choose one"
          options={cat.options(type)}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          hint={hint}
          errors={action.fieldErrors}
          id={fid('category')}
        />
        <TextField name="amount" label="Amount ($)" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={initial?.amount} errors={action.fieldErrors} id={fid('amount')} />
      </FieldRow>
      <FieldRow cols={3}>
        <TextField name="date" label={type === 'income' ? 'Date received' : 'Date paid'} type="date" required defaultValue={initial?.date ?? new Date().toISOString().slice(0, 10)} errors={action.fieldErrors} id={fid('date')} />
        <TextField name="payee" label={type === 'income' ? 'Paid by' : 'Paid to'} defaultValue={initial?.payee} hint={type === 'income' ? undefined : own ? 'Your lender, the town, the contractor.' : 'The company or person, as on the receipt.'} errors={action.fieldErrors} id={fid('payee')} />
        {spends ? (
          <SelectField name="paidFrom" label="Paid from" options={[...PAID_FROM]} defaultValue={initial?.paidFrom ?? 'business'} id={fid('paidFrom')} />
        ) : (
          <div />
        )}
      </FieldRow>
      <TextAreaField name="description" label="Note" rows={2} defaultValue={initial?.description} hint="What it was for. Keep the receipt: the IRS can ask for it." errors={action.fieldErrors} id={fid('description')} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
          {method === 'POST' ? 'Save' : 'Save changes'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
