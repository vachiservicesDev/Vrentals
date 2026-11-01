'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useResource } from '@/lib/client/api';
import { catalog, type Transaction } from '@/components/money/MoneyPanel';
import { ExpenseWizard, attachReceipt, type ExpenseHome } from '@/components/money/ExpenseWizard';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, Loading, PageHeader, Panel, When, formatMoney } from '@/components/ui/ui';

type Entry = Transaction & { home: ExpenseHome; receipt: { id: string; name: string; fileName: string } | null };

const SPENDING = new Set(['expense', 'capital']);

/** Every bill and expense across your homes for a year, with its receipt, and a short form to add one. */
export default function ExpensesPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [homeFilter, setHomeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const { data, error, loading, reload } = useResource<{ homes: ExpenseHome[]; transactions: Entry[] }>(`/api/transactions?year=${year}`);

  if (loading && !data) return <Loading />;
  const homes = data?.homes ?? [];
  const label = (t: Entry) => catalog(t.home.use === 'own').categoryOf(t.type, t.category)?.label ?? t.category;
  const spending = (data?.transactions ?? []).filter((t) => SPENDING.has(t.type) && (!homeFilter || t.home.id === homeFilter));
  const rows = typeFilter ? spending.filter((t) => label(t) === typeFilter) : spending;
  const total = spending.reduce((s, t) => s + Number(t.amount), 0);
  const improvements = spending.filter((t) => t.type === 'capital').reduce((s, t) => s + Number(t.amount), 0);
  const missing = spending.filter((t) => !t.receipt).length;
  const byType = [...spending.reduce((m, t) => m.set(label(t), (m.get(label(t)) ?? 0) + Number(t.amount)), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const biggest = byType[0]?.[1] ?? 1;
  const allOwn = homes.length > 0 && homes.every((h) => h.use === 'own');

  async function upload(t: Entry, file: File) {
    setRowError(null);
    setUploading(t.id);
    const problem = await attachReceipt(t.home.id, t.id, file, `${t.payee || label(t)} ${t.date}`);
    setUploading(null);
    if (problem) setRowError(problem);
    else reload();
  }

  return (
    <>
      <PageHeader
        eyebrow={allOwn ? 'Your home' : 'Money'}
        title="Expenses and bills"
        lead="What you paid for your homes, with a photo or PDF of each bill. These add up to your year-end tax reports."
        actions={
          homes.length > 0 &&
          !adding && (
            <Button
              onClick={() => {
                setNotice(null);
                setAdding(true);
              }}
            >
              Add an expense
            </Button>
          )
        }
      />
      <div ref={top} className="grid scroll-mt-32 gap-6">
        {error && <Alert title="Couldn't load your expenses">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {homes.length === 0 && !error && (
          <EmptyState title="Add a home first" action={<Link href="/dashboard" className="link">Go to your dashboard</Link>}>
            Expenses belong to a home, so add your home or rental first.
          </EmptyState>
        )}

        {adding && (
          <Panel title="Add an expense or bill" actions={<Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Close</Button>}>
            <ExpenseWizard
              key={formKey}
              homes={homes}
              onSaved={(message) => {
                setNotice(message);
                setAdding(false);
                setFormKey((k) => k + 1);
                reload();
                top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
          </Panel>
        )}

        {homes.length > 0 && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-semibold text-ink">
                Year
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal">
                  {[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </label>
              {homes.length > 1 && (
                <label className="grid gap-1 text-sm font-semibold text-ink">
                  Home
                  <select value={homeFilter} onChange={(e) => setHomeFilter(e.target.value)} className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal">
                    <option value="">All homes</option>
                    {homes.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label={`Paid in ${year}`} value={formatMoney(total)} hint={`${spending.length} ${spending.length === 1 ? 'entry' : 'entries'}`} />
              <Tile label="Improvements" value={formatMoney(improvements)} hint={allOwn ? 'Add to your cost basis' : 'Depreciated over the years'} />
              <Tile label="Biggest cost" value={byType[0] ? byType[0][0] : '—'} hint={byType[0] ? formatMoney(byType[0][1]) : undefined} />
              <Tile label="Missing a receipt" value={String(missing)} hint={missing ? 'Use Upload in the list' : 'All attached'} tone={missing ? 'warning' : undefined} />
            </dl>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Panel title={typeFilter ? `${typeFilter} in ${year}` : `All expenses in ${year}`} actions={typeFilter ? <Button variant="ghost" size="sm" onClick={() => setTypeFilter('')}>Show all</Button> : undefined}>
                {rowError && (
                  <div className="mb-4">
                    <Alert>{rowError}</Alert>
                  </div>
                )}
                {rows.length === 0 ? (
                  <EmptyState title="Nothing yet">Press “Add an expense” to add your first bill.</EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {rows.map((t) => (
                      <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{label(t)}</p>
                          <p className="text-sm text-muted">
                            <When iso={t.date} />
                            {t.payee ? ` · ${t.payee}` : ''}
                            {homes.length > 1 ? ` · ${t.home.name}` : ''}
                            {t.type === 'capital' ? ' · Improvement' : ''}
                          </p>
                        </div>
                        <p className="text-right font-semibold tabular-nums text-ink">{formatMoney(t.amount)}</p>
                        <div className="col-span-2 flex flex-wrap items-center gap-2 text-sm">
                          {t.receipt ? (
                            <a href={`/api/documents/${t.receipt.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 font-medium text-green-700 ring-1 ring-green-700/20 hover:underline">
                              <PaperClip />
                              {t.receipt.fileName}
                            </a>
                          ) : (
                            <label className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3 font-medium text-brand-700 hover:border-brand-600 ${uploading === t.id ? 'opacity-60' : ''}`}>
                              <PaperClip />
                              {uploading === t.id ? 'Uploading…' : 'Upload receipt'}
                              <input
                                type="file"
                                accept="image/*,.pdf,.heic"
                                className="sr-only"
                                disabled={uploading === t.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) upload(t, file);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title={`${year} by type`} description="Tap a type to see only those.">
                {byType.length === 0 ? (
                  <p className="text-ink-2">Totals appear here once you add expenses.</p>
                ) : (
                  <ul className="grid gap-1">
                    {byType.map(([name, amount]) => (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => setTypeFilter(typeFilter === name ? '' : name)}
                          aria-pressed={typeFilter === name}
                          className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left hover:bg-subtle ${typeFilter === name ? 'bg-brand-50' : ''}`}
                        >
                          <span className="truncate text-ink">{name}</span>
                          <span className="font-semibold tabular-nums text-ink">{formatMoney(amount)}</span>
                          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-subtle">
                            <span className="block h-full rounded-full bg-brand-700" style={{ width: `${Math.max(3, (amount / biggest) * 100)}%` }} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warning' }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-0.5 truncate font-display text-xl font-semibold ${tone === 'warning' ? 'text-amber-800' : 'text-ink'}`}>{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function PaperClip() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />
    </svg>
  );
}
