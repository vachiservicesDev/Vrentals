'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResource } from '@/lib/client/api';
import type { Report as ReportData } from '@/lib/rentals/report';
import { Button, buttonClass } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/fields';
import { Alert, Chip, DataTable, EmptyState, Loading, PageHeader, Panel, When, formatMoney } from '@/components/ui/ui';

interface Home {
  id: string;
  name: string;
}

const TYPE_LABEL: Record<string, string> = { expense: 'Expense', income: 'Income', capital: 'Improvement', deposit: 'Deposit' };

/**
 * Profit and loss for a tax year or any dates, for all homes or one. Laid out the way an
 * accountant reads it: income, expenses by category, net, then the Schedule E line totals,
 * improvements, deposits and every entry behind the numbers. Prints cleanly to PDF.
 */
export default function ReportsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Report />
    </Suspense>
  );
}

function Report() {
  const router = useRouter();
  const search = useSearchParams();
  const thisYear = new Date().getFullYear();
  const property = search.get('property') ?? '';
  const from = search.get('from') ?? `${thisYear}-01-01`;
  const to = search.get('to') ?? `${thisYear}-12-31`;
  const yearOf = from.endsWith('-01-01') && to === `${from.slice(0, 4)}-12-31` ? from.slice(0, 4) : 'custom';
  const [mode, setMode] = useState(yearOf);

  const query = new URLSearchParams({ from, to, ...(property ? { property } : {}) }).toString();
  const homes = useResource<{ properties: Home[] }>('/api/properties');
  const { data, error, loading } = useResource<ReportData>(`/api/reports/pnl?${query}`);

  function go(next: { property?: string; from?: string; to?: string }) {
    const p = new URLSearchParams({ from, to, ...(property ? { property } : {}), ...next });
    if (!p.get('property')) p.delete('property');
    router.replace(`/reports?${p.toString()}`);
  }

  const homeName = homes.data?.properties.find((h) => h.id === property)?.name;
  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i));

  return (
    <>
      <PageHeader
        eyebrow="Money & taxes"
        title="Profit & loss"
        lead={
          <>
            {homeName ?? 'All homes'} · <When iso={from} /> to <When iso={to} />
          </>
        }
        actions={
          <span className="no-print flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => window.print()}>
              Print or save PDF
            </Button>
            <a href={`/api/reports/pnl?${query}&format=csv`} className={buttonClass('secondary')} download>
              Download CSV
            </a>
          </span>
        }
      />

      <form className="no-print mb-8 grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <SelectField
          name="property"
          label="Home"
          options={[{ value: '', label: 'All homes' }, ...(homes.data?.properties ?? []).map((h) => ({ value: h.id, label: h.name }))]}
          value={property}
          onChange={(e) => go({ property: e.target.value })}
        />
        <SelectField
          name="period"
          label="Period"
          options={[...years.map((y) => ({ value: y, label: `Tax year ${y}` })), { value: 'custom', label: 'Pick dates' }]}
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            if (e.target.value !== 'custom') go({ from: `${e.target.value}-01-01`, to: `${e.target.value}-12-31` });
          }}
        />
        {mode === 'custom' && (
          <>
            <TextField name="from" label="From" type="date" value={from} onChange={(e) => e.target.value && go({ from: e.target.value })} />
            <TextField name="to" label="To" type="date" value={to} onChange={(e) => e.target.value && go({ to: e.target.value })} />
          </>
        )}
      </form>

      {loading && !data ? <Loading /> : error || !data ? <Alert title="Couldn't load the report">{error}</Alert> : <Statement report={data} allHomes={!property} />}
    </>
  );
}

function Statement({ report: r, allHomes }: { report: ReportData; allHomes: boolean }) {
  const s = r.statement;
  const empty = s.totalIncome === 0 && s.totalExpenses === 0 && r.entries.length === 0;
  if (empty) return <EmptyState title="Nothing recorded for these dates">Record rent on each home, and add expenses under Money on the home&apos;s page.</EmptyState>;

  return (
    <div className="grid gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Big label="Total income" value={s.totalIncome} />
        <Big label="Total expenses" value={s.totalExpenses} />
        <Big label="Net before depreciation" value={s.net} signed />
        {r.taxableEstimate !== null ? <Big label="After depreciation (estimate)" value={r.taxableEstimate} signed /> : <Big label="Paid personally" value={s.paidPersonally} />}
      </section>

      <Panel title="Income and expenses" description="Cash basis: rent and income when received, expenses when paid.">
        <table className="w-full text-left">
          <caption className="sr-only">Profit and loss</caption>
          <tbody className="divide-y divide-line">
            <Head>Income</Head>
            {s.income.length === 0 && <Row label="No income in this period" amount={0} muted />}
            {s.income.map((l) => (
              <Row key={l.category} label={l.label} amount={l.amount} />
            ))}
            <Row label="Total income" amount={s.totalIncome} strong />
            <Head>Expenses</Head>
            {s.expenses.length === 0 && <Row label="No expenses in this period" amount={0} muted />}
            {s.expenses.map((l) => (
              <Row key={l.category} label={l.label} note={`Schedule E line ${l.line}`} amount={l.amount} />
            ))}
            <Row label="Total expenses" amount={s.totalExpenses} strong />
            <Row label="Net income before depreciation" amount={s.net} strong signed />
            {r.depreciation !== null && (
              <>
                <Row label="Depreciation (estimate)" note="Schedule E line 18" amount={-r.depreciation} />
                <Row label="Net after depreciation (estimate)" note="Schedule E line 21" amount={r.taxableEstimate ?? 0} strong signed />
              </>
            )}
          </tbody>
        </table>
        {r.missingDepreciation.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            No depreciation estimate for {r.missingDepreciation.join(', ')}: add the purchase price and the date it was first ready to rent under the home&apos;s details.
          </p>
        )}
      </Panel>

      <Panel title="For your tax preparer: Schedule E" description="Totals by line of IRS Schedule E, Part I. Depreciation is an estimate (27.5-year straight line, mid-month); your preparer's figure is the one to file.">
        <DataTable
          caption="Schedule E lines"
          rows={[...s.scheduleE, ...(r.depreciation !== null ? [{ line: 18, label: 'Depreciation expense or depletion (estimate)', amount: r.depreciation }] : [])].sort((a, b) => a.line - b.line)}
          rowKey={(l) => String(l.line)}
          columns={[
            { header: 'Line', cell: (l) => l.line },
            { header: 'Description', primary: true, cell: (l) => l.label },
            { header: 'Amount', align: 'right', cell: (l) => formatMoney(l.amount) },
          ]}
        />
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {r.homes.map((h) => (
            <div key={h.id} className="rounded-md bg-subtle p-3 text-sm">
              <dt className="font-semibold text-ink">{h.name}</dt>
              <dd className="mt-1 text-ink-2">
                {h.rentalDays} days rented (line 2) · net {formatMoney(h.net)}
                {h.depreciation !== null && ` · depreciation ${formatMoney(h.depreciation)}`}
              </dd>
            </div>
          ))}
        </dl>
      </Panel>

      {allHomes && r.homes.length > 1 && (
        <Panel title="By home">
          <DataTable
            caption="Profit by home"
            rows={r.homes}
            rowKey={(h) => h.id}
            columns={[
              { header: 'Home', primary: true, cell: (h) => h.name },
              { header: 'Income', align: 'right', cell: (h) => formatMoney(h.income) },
              { header: 'Expenses', align: 'right', cell: (h) => formatMoney(h.expenses) },
              { header: 'Net', align: 'right', cell: (h) => <span className={h.net < 0 ? 'text-danger-700' : 'font-semibold text-ink'}>{formatMoney(h.net)}</span> },
            ]}
          />
        </Panel>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="Improvements" description="Not expenses: these are depreciated over several years. Give this list to your preparer.">
          {s.improvements.length === 0 ? (
            <p className="text-ink-2">None in this period.</p>
          ) : (
            <table className="w-full text-left">
              <tbody className="divide-y divide-line">
                {s.improvements.map((l) => (
                  <Row key={l.category} label={l.label} amount={l.amount} />
                ))}
                <Row label="Total improvements" amount={s.totalImprovements} strong />
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Security deposits and your own money" description="Deposits belong to tenants until kept or returned, so they're not income.">
          <table className="w-full text-left">
            <tbody className="divide-y divide-line">
              <Row label="Deposits received to date" amount={s.deposits.received} />
              <Row label="Deposits returned to date" amount={s.deposits.returned} />
              <Row label="Deposits you're holding" amount={s.deposits.held} strong />
              <Row label="Paid from your personal card or account" note="What the business owes you back" amount={s.paidPersonally} strong />
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Every entry" description="Each line behind the totals above.">
        <DataTable
          caption="All entries"
          rows={r.entries}
          rowKey={(e) => `${e.source ?? 'tx'}-${e.id}`}
          columns={[
            { header: 'Date', cell: (e) => <When iso={e.date} /> },
            {
              header: 'What',
              primary: true,
              cell: (e) => (
                <span>
                  {e.label}
                  <span className="block text-sm font-normal text-muted">{[allHomes ? e.home : null, e.payee, e.description].filter(Boolean).join(' · ')}</span>
                </span>
              ),
            },
            {
              header: 'Type',
              cell: (e) => (
                <span className="inline-flex flex-wrap gap-1.5">
                  <Chip tone={e.type === 'income' ? 'live' : e.type === 'deposit' ? 'info' : e.type === 'capital' ? 'warning' : 'draft'}>{TYPE_LABEL[e.type]}</Chip>
                  {e.paidFrom === 'personal' && <Chip tone="new">Personal</Chip>}
                </span>
              ),
            },
            { header: 'Line', cell: (e) => (e.line ? e.line : '—') },
            { header: 'Amount', align: 'right', cell: (e) => formatMoney(e.amount) },
          ]}
        />
      </Panel>
      <p className="text-sm text-muted">Prepared with Rentals. Figures are what was recorded in the app; depreciation is an estimate. Not tax advice.</p>
    </div>
  );
}

function Big({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[var(--shadow-panel)]">
      <p className="t-label text-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl font-semibold ${signed && value < 0 ? 'text-danger-700' : 'text-ink'}`}>{formatMoney(value)}</p>
    </div>
  );
}

function Head({ children }: { children: string }) {
  return (
    <tr>
      <th colSpan={2} scope="rowgroup" className="t-label pb-2 pt-5 font-normal text-muted first:pt-0">
        {children}
      </th>
    </tr>
  );
}

function Row({ label, note, amount, strong, signed, muted }: { label: string; note?: string; amount: number; strong?: boolean; signed?: boolean; muted?: boolean }) {
  return (
    <tr>
      <td className={`py-2.5 pr-4 ${strong ? 'font-semibold text-ink' : muted ? 'text-muted' : 'text-ink-2'}`}>
        {label}
        {note && <span className="ml-2 text-xs text-muted">{note}</span>}
      </td>
      <td className={`py-2.5 text-right tabular-nums ${strong ? 'font-semibold' : ''} ${signed && amount < 0 ? 'text-danger-700' : strong ? 'text-ink' : 'text-ink-2'}`}>{muted ? '' : formatMoney(amount)}</td>
    </tr>
  );
}
