import { NextRequest, NextResponse } from 'next/server';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedProperty } from '@/lib/rentals/access';
import { buildHomeReport, type HomeReport } from '@/lib/rentals/homeReport';
import { csvLine } from '@/lib/rentals/money';

/**
 * The year-end summary for homes the owner lives in: Schedule A items, cost basis, energy credits
 * and the home office share. `year` defaults to this year; `property` narrows it to one home;
 * `format=csv` downloads it for a spreadsheet or a tax preparer.
 */
export async function GET(request: NextRequest) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const q = request.nextUrl.searchParams;
  const asked = Number(q.get('year'));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(todayEastern().slice(0, 4));

  const propertyId = q.get('property') || undefined;
  if (propertyId) {
    const home = await ownedProperty(gate.ownerId, propertyId);
    if (!home || home.use !== 'own') return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const report = await buildHomeReport(gate.ownerId, year, propertyId);
  if (q.get('format') !== 'csv') return NextResponse.json(report);

  const scope = propertyId ? report.homes[0]?.name ?? 'home' : 'my-home';
  const filename = `homeowner-tax-summary-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${year}.csv`;
  return new NextResponse(toCsv(report), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
}

function toCsv(r: HomeReport): string {
  const money = (n: number) => n.toFixed(2);
  const out: string[] = [csvLine(['Homeowner tax summary', r.year]), csvLine(['Basis', 'Cash (each payment on the day it was paid)']), ''];
  const s = r.combined;
  if (s) {
    out.push(
      csvLine(['Itemized deductions (Schedule A)', 'Where', 'Amount']),
      ...s.scheduleA.map((l) => csvLine([l.label, l.form ?? '', money(l.amount)])),
      csvLine(['Total for Schedule A', '', money(s.totalScheduleA)]),
      csvLine(['Property tax counts toward the SALT cap of', '', money(s.salt.cap)]),
      '',
      csvLine(['Paid, not deductible', 'Amount']),
      ...s.notDeductible.map((l) => csvLine([l.label, money(l.amount)])),
      '',
    );
  }
  for (const h of r.homes) {
    const x = h.summary;
    out.push(
      csvLine(['Home', h.name, h.address]),
      csvLine(['Purchase price', x.basis.purchasePrice === null ? '' : money(x.basis.purchasePrice)]),
      csvLine(['Improvements to date', money(x.basis.improvementsToDate)]),
      csvLine(['Energy credits taken to date (lower basis)', money(x.basis.energyCreditsToDate)]),
      csvLine(['Adjusted cost basis', x.basis.adjusted === null ? '' : money(x.basis.adjusted)]),
      ...x.improvementsThisYear.map((l) => csvLine([`Improvement in ${r.year}: ${l.label}`, money(l.amount)])),
    );
    if (x.energy.eligible && (x.energy.efficiencySpent || x.energy.cleanSpent)) {
      out.push(
        csvLine(['Energy efficient home improvement credit estimate (Form 5695 Part II)', money(x.energy.efficiencyCredit)]),
        csvLine(['Residential clean energy credit estimate (Form 5695 Part I)', money(x.energy.cleanCredit)]),
      );
    }
    if (x.office) {
      out.push(
        csvLine(['Home office', `${x.office.sqft} of ${x.office.homeSqft} sq ft (${x.office.percent}%)`]),
        csvLine(['Simplified method deduction', money(x.office.simplified)]),
        csvLine(['Regular method: business share of home costs', money(x.office.regularShare)]),
      );
    }
    out.push('');
  }
  out.push(
    csvLine(['Date', 'Home', 'Kind', 'Category', 'Where it goes', 'Paid to', 'Note', 'Amount']),
    ...r.entries.map((e) => csvLine([e.date, e.home, e.type === 'capital' ? 'Improvement' : 'Payment', e.label, e.form ?? '', e.payee, e.description, money(e.amount)])),
  );
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}
