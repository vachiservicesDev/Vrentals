'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResource } from '@/lib/client/api';
import type { HomeReport } from '@/lib/rentals/homeReport';
import { EFFICIENCY_CREDIT_LIMIT, EFFICIENCY_CREDIT_LIMIT_WITH_HEAT_PUMP, SALE_EXCLUSION, SIMPLIFIED_OFFICE_MAX_SQFT, type HomeLine, type HomeTaxSummary } from '@/lib/rentals/homeowner';
import { Button, LinkButton, buttonClass } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/fields';
import { ReportTabs } from '@/components/money/ReportTabs';
import { Alert, Chip, DataTable, EmptyState, Loading, PageHeader, Panel, When, formatMoney } from '@/components/ui/ui';

/**
 * The year-end summary for a home you live in: what can go on Schedule A, what isn't deductible,
 * your cost basis, energy credits and the home office share. Prints cleanly to PDF for a preparer.
 */
export default function HomeTaxPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Summary />
    </Suspense>
  );
}

function Summary() {
  const router = useRouter();
  const search = useSearchParams();
  const thisYear = new Date().getFullYear();
  const year = Number(search.get('year')) || thisYear;
  const property = search.get('property') ?? '';
  const query = new URLSearchParams({ year: String(year), ...(property ? { property } : {}) }).toString();
  const homes = useResource<{ properties: { id: string; name: string; use: string }[] }>('/api/properties');
  const { data, error, loading } = useResource<HomeReport>(`/api/reports/home?${query}`);
  const own = (homes.data?.properties ?? []).filter((h) => h.use === 'own');

  function go(next: { year?: string; property?: string }) {
    const p = new URLSearchParams({ year: String(year), ...(property ? { property } : {}), ...next });
    if (!p.get('property')) p.delete('property');
    router.replace(`/reports/home?${p.toString()}`);
  }

  const years = Array.from({ length: 6 }, (_, i) => String(thisYear - i));
  return (
    <>
      <ReportTabs current="home" />
      <PageHeader
        eyebrow="Money & taxes"
        title="Homeowner tax summary"
        lead={`Tax year ${year} · ${own.find((h) => h.id === property)?.name ?? (own.length === 1 ? own[0].name : 'Homes you live in')}`}
        actions={
          <span className="no-print flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => window.print()}>
              Print or save PDF
            </Button>
            <a href={`/api/reports/home?${query}&format=csv`} className={buttonClass('secondary')} download>
              Download CSV
            </a>
          </span>
        }
      />
      <form className="no-print mb-8 grid gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <SelectField name="year" label="Tax year" options={years.map((y) => ({ value: y, label: `Tax year ${y}` }))} value={String(year)} onChange={(e) => go({ year: e.target.value })} />
        {own.length > 1 && (
          <SelectField name="property" label="Home" options={[{ value: '', label: 'All homes you live in' }, ...own.map((h) => ({ value: h.id, label: h.name }))]} value={property} onChange={(e) => go({ property: e.target.value })} />
        )}
      </form>
      {loading && !data ? <Loading /> : error || !data ? <Alert title="Couldn't load the summary">{error}</Alert> : <Body report={data} />}
    </>
  );
}

function Body({ report: r }: { report: HomeReport }) {
  if (!r.combined)
    return (
      <EmptyState
        title="No home you live in yet"
        action={
          <LinkButton href="/dashboard" arrow>
            Add your home
          </LinkButton>
        }
      >
        Add your home on the dashboard and choose “I live here”, or change an existing home under its details. Then record your mortgage interest, property tax and other payments under Money.
      </EmptyState>
    );
  const s = r.combined;
  const many = r.homes.length > 1;

  return (
    <div className="grid gap-8">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Big label="Paid on your home" value={s.totalSpending} />
        <Big label="Deductible if you itemize" value={s.totalScheduleA} />
        <Big label="Improvements this year" value={s.totalImprovementsThisYear} />
        {s.energy.eligible ? <Big label="Energy credits (estimate)" value={s.energy.efficiencyCredit + s.energy.cleanCredit} /> : <Big label="Not deductible" value={Math.round((s.totalSpending - s.totalScheduleA) * 100) / 100} />}
      </section>

      <Panel title="Itemized deductions (Schedule A)" description="Your lender's Form 1098 and your town's tax bills are the official figures. Check these totals against them.">
        <Lines lines={s.scheduleA} empty="No mortgage interest or property tax recorded this year." total={s.totalScheduleA} totalLabel="Home items for Schedule A" />
        <div className="mt-6 grid gap-4 text-sm text-ink-2 md:grid-cols-2">
          <Note title="Itemize or take the standard deduction?">
            {s.standardDeduction ? (
              <>
                You save by itemizing only when all your itemized deductions together (these, plus state income tax, charity and others) are more than the standard deduction for {r.year}: {formatMoney(s.standardDeduction.single)} single,{' '}
                {formatMoney(s.standardDeduction.mfj)} married filing jointly, {formatMoney(s.standardDeduction.hoh)} head of household.
              </>
            ) : (
              <>You save by itemizing only when all your itemized deductions together are more than your standard deduction for {r.year}.</>
            )}
          </Note>
          <Note title="State and local tax (SALT) cap">
            Property tax ({formatMoney(s.salt.propertyTax)}) and your state income tax share one cap of {formatMoney(s.salt.cap)} for {r.year} ({formatMoney(s.salt.separate)} if married filing separately)
            {s.salt.phaseOutAbove ? `, which shrinks when income is above ${formatMoney(s.salt.phaseOutAbove)}, down to $10,000.` : '.'}
          </Note>
          <Note title="Mortgage interest limit">Interest is deductible on up to $750,000 of loans used to buy, build or improve your home ($1 million for loans from before December 16, 2017). Interest on a home equity loan used for other things isn&apos;t.</Note>
          {s.pmiNotDeductible > 0 ? (
            <Note title="Mortgage insurance">{formatMoney(s.pmiNotDeductible)} of mortgage insurance isn&apos;t deductible for {r.year}. It becomes deductible again from tax year 2026.</Note>
          ) : (
            <Note title="Mortgage insurance">From tax year 2026, PMI is deductible again on Schedule A. The deduction phases out between $100,000 and $109,000 of adjusted gross income.</Note>
          )}
        </div>
      </Panel>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="Paid, not deductible" description="Normal for a home you live in. Kept here so you see where the money went.">
          <Lines lines={s.notDeductible} empty="Nothing else recorded this year." />
        </Panel>
        <Panel title="Improvements this year" description="Not deductible now, but they raise your cost basis, which lowers the taxable gain when you sell.">
          <Lines lines={s.improvementsThisYear} empty="No improvements recorded this year." total={s.totalImprovementsThisYear} totalLabel="Total improvements" />
        </Panel>
      </div>

      <Panel title="Energy credits (Form 5695)">
        {s.energy.eligible ? (
          s.energy.efficiencySpent || s.energy.cleanSpent ? (
            <table className="w-full text-left">
              <tbody className="divide-y divide-line">
                <Row label="Energy-saving upgrades" note="Part II, Energy Efficient Home Improvement Credit" amount={s.energy.efficiencySpent} />
                <Row label="Credit estimate: 30%, up to $1,200 a year" amount={s.energy.efficiencyCredit} strong />
                <Row label="Solar, battery or geothermal" note="Part I, Residential Clean Energy Credit" amount={s.energy.cleanSpent} />
                <Row label="Credit estimate: 30%, no yearly limit" amount={s.energy.cleanCredit} strong />
              </tbody>
            </table>
          ) : (
            <p className="text-ink-2">No energy-saving upgrades recorded in {r.year}.</p>
          )
        ) : (
          <p className="text-ink-2">
            {r.year >= 2026
              ? 'Both home energy credits ended for anything installed after December 31, 2025 (One Big Beautiful Bill Act). Upgrades this year still add to your cost basis.'
              : `This app estimates the 30% credits for 2023 to 2025 only. Ask your preparer about ${r.year}.`}
          </p>
        )}
        {s.energy.eligible && (
          <p className="mt-4 text-sm text-muted">
            Heat pumps, heat pump water heaters and biomass stoves have their own $2,000 limit, so the yearly total can reach {formatMoney(EFFICIENCY_CREDIT_LIMIT_WITH_HEAT_PUMP)}; this estimate uses the general {formatMoney(EFFICIENCY_CREDIT_LIMIT)} limit. Windows, doors and audits have smaller per-item limits. Products need the manufacturer&apos;s qualified product ID, and the credit lowers your cost basis.
          </p>
        )}
      </Panel>

      {r.homes.map((h) => (
        <HomeDetail key={h.id} name={h.name} address={h.address} summary={h.summary} titled={many} year={r.year} />
      ))}

      <Panel title="Every entry" description={`Each payment and improvement in ${r.year}.`}>
        {r.entries.length === 0 ? (
          <p className="text-ink-2">Nothing recorded in {r.year}.</p>
        ) : (
          <DataTable
            caption="All entries"
            rows={r.entries}
            rowKey={(e) => e.id}
            columns={[
              { header: 'Date', cell: (e) => <When iso={e.date} /> },
              {
                header: 'What',
                primary: true,
                cell: (e) => (
                  <span>
                    {e.label}
                    <span className="block text-sm font-normal text-muted">{[many ? e.home : null, e.payee, e.description].filter(Boolean).join(' · ')}</span>
                  </span>
                ),
              },
              { header: 'Kind', cell: (e) => <Chip tone={e.type === 'capital' ? 'warning' : e.form ? 'live' : 'draft'}>{e.type === 'capital' ? 'Improvement' : e.form ? 'Deductible' : 'Payment'}</Chip> },
              { header: 'Where', cell: (e) => e.form ?? '—' },
              { header: 'Amount', align: 'right', cell: (e) => formatMoney(e.amount) },
            ]}
          />
        )}
      </Panel>
      <p className="text-sm text-muted">Prepared with Rentals from what you recorded, using IRS limits for {r.year} where they&apos;re known. Credits and limits are estimates. Not tax advice: your preparer&apos;s numbers are the ones to file.</p>
    </div>
  );
}

function HomeDetail({ name, address, summary: s, titled, year }: { name: string; address: string; summary: HomeTaxSummary; titled: boolean; year: number }) {
  return (
    <Panel title={titled ? `${name}: cost basis and home office` : 'Cost basis and home office'} description={titled ? address : undefined}>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold text-ink">Cost basis at the end of {year}</h3>
          <table className="w-full text-left">
            <tbody className="divide-y divide-line">
              {s.basis.purchasePrice === null ? <Row label="Purchase price" note="Add it under the home's details" amount={0} muted /> : <Row label="Purchase price with closing costs" amount={s.basis.purchasePrice} />}
              <Row label="Improvements to date" amount={s.basis.improvementsToDate} />
              {s.basis.energyCreditsToDate > 0 && <Row label="Less energy credits taken" amount={-s.basis.energyCreditsToDate} />}
              {s.basis.adjusted !== null && <Row label="Adjusted cost basis" amount={s.basis.adjusted} strong />}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-muted">
            When you sell a main home you owned and lived in for 2 of the last 5 years, up to {formatMoney(SALE_EXCLUSION.single)} of gain ({formatMoney(SALE_EXCLUSION.mfj)} married filing jointly) is tax free. Keep receipts for every improvement.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-ink">Home office</h3>
          {s.office ? (
            <>
              <p className="mb-3 text-sm text-ink-2">
                Office of {s.office.sqft} sq ft in a {s.office.homeSqft} sq ft home ({s.office.percent}%). Only for self-employed work, on Schedule C. Pick one method:
              </p>
              <table className="w-full text-left">
                <tbody className="divide-y divide-line">
                  <Row label="Simplified method" note={`$5 a sq ft, up to ${SIMPLIFIED_OFFICE_MAX_SQFT} sq ft`} amount={s.office.simplified} strong />
                  <Row label="Regular method (Form 8829)" note={`${s.office.percent}% of the costs below`} amount={s.office.regularShare} strong />
                  {s.office.regularLines.map((l) => (
                    <Row key={l.category} label={l.label} amount={l.amount} />
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm text-muted">With the regular method, the office share of mortgage interest and property tax moves from Schedule A to Form 8829, and depreciation on the office (which your preparer works out) is taxed back when you sell.</p>
            </>
          ) : (
            <p className="text-ink-2">Not set up. If you&apos;re self-employed and use a room only for work, add the square feet under the home&apos;s details.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Lines({ lines, empty, total, totalLabel }: { lines: HomeLine[]; empty: string; total?: number; totalLabel?: string }) {
  if (lines.length === 0) return <p className="text-ink-2">{empty}</p>;
  return (
    <table className="w-full text-left">
      <tbody className="divide-y divide-line">
        {lines.map((l) => (
          <Row key={l.category} label={l.label} note={l.form} amount={l.amount} />
        ))}
        {total !== undefined && totalLabel && <Row label={totalLabel} amount={total} strong />}
      </tbody>
    </table>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-subtle p-3">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function Big({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[var(--shadow-panel)]">
      <p className="t-label text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold text-ink">{formatMoney(value)}</p>
    </div>
  );
}

function Row({ label, note, amount, strong, muted }: { label: string; note?: string; amount: number; strong?: boolean; muted?: boolean }) {
  return (
    <tr>
      <td className={`py-2.5 pr-4 ${strong ? 'font-semibold text-ink' : muted ? 'text-muted' : 'text-ink-2'}`}>
        {label}
        {note && <span className="ml-2 text-xs text-muted">{note}</span>}
      </td>
      <td className={`py-2.5 text-right tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink-2'}`}>{muted ? '—' : formatMoney(amount)}</td>
    </tr>
  );
}
