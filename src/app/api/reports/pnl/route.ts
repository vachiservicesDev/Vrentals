import { NextRequest, NextResponse } from 'next/server';
import { requireLandlord } from '@/lib/auth/guards';
import { todayEastern } from '@/lib/dates';
import { ownedProperty } from '@/lib/rentals/access';
import { csvLine } from '@/lib/rentals/money';
import { buildReport, type Report } from '@/lib/rentals/report';

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/**
 * Profit and loss. `from` and `to` (YYYY-MM-DD) default to this calendar year; `property` narrows
 * it to one home; `format=csv` downloads it for a spreadsheet or an accountant.
 */
export async function GET(request: NextRequest) {
  const gate = await requireLandlord();
  if (!gate.ok) return NextResponse.json({ message: gate.message }, { status: gate.status });

  const q = request.nextUrl.searchParams;
  const year = todayEastern().slice(0, 4);
  const from = isDay(q.get('from')) ? q.get('from')! : `${year}-01-01`;
  const to = isDay(q.get('to')) ? q.get('to')! : `${year}-12-31`;
  if (from > to) return NextResponse.json({ message: 'The start date must be before the end date.' }, { status: 400 });

  const propertyId = q.get('property') || undefined;
  if (propertyId && !(await ownedProperty(gate.ownerId, propertyId))) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const report = await buildReport(gate.ownerId, from, to, propertyId);
  if (q.get('format') !== 'csv') return NextResponse.json(report);

  const scope = propertyId ? report.homes[0]?.name ?? 'home' : 'all-homes';
  const filename = `rentals-profit-and-loss-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-to-${to}.csv`;
  return new NextResponse(toCsv(report, propertyId ? scope : 'All homes'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
}

function toCsv(r: Report, scope: string): string {
  const s = r.statement;
  const money = (n: number) => n.toFixed(2);
  const out: string[] = [
    csvLine(['Profit and loss', scope]),
    csvLine(['Period', `${r.from} to ${r.to}`]),
    csvLine(['Basis', 'Cash (rent when received, expenses when paid)']),
    '',
    csvLine(['Section', 'Schedule E line', 'Category', 'Amount']),
    ...s.income.map((l) => csvLine(['Income', l.line, l.label, money(l.amount)])),
    csvLine(['Income', '', 'Total income', money(s.totalIncome)]),
    ...s.expenses.map((l) => csvLine(['Expense', l.line, l.label, money(l.amount)])),
    csvLine(['Expense', '', 'Total expenses', money(s.totalExpenses)]),
    csvLine(['Result', '', 'Net income before depreciation', money(s.net)]),
  ];
  if (r.depreciation !== null) {
    out.push(csvLine(['Result', 18, 'Depreciation (estimate)', money(r.depreciation)]));
    out.push(csvLine(['Result', 21, 'Net after depreciation (estimate)', money(r.taxableEstimate ?? 0)]));
  }
  out.push(
    '',
    csvLine(['Schedule E line', 'Description', 'Amount']),
    ...s.scheduleE.map((l) => csvLine([l.line, l.label, money(l.amount)])),
    '',
    csvLine(['Home', 'Income', 'Expenses', 'Net', 'Depreciation (estimate)', 'Days rented']),
    ...r.homes.map((h) => csvLine([h.name, money(h.income), money(h.expenses), money(h.net), h.depreciation === null ? '' : money(h.depreciation), h.rentalDays])),
    '',
    csvLine(['Improvements (depreciated, not expensed)', 'Amount']),
    ...s.improvements.map((l) => csvLine([l.label, money(l.amount)])),
    csvLine(['Total improvements', money(s.totalImprovements)]),
    '',
    csvLine(['Security deposits', 'Amount']),
    csvLine(['Received to date', money(s.deposits.received)]),
    csvLine(['Returned to date', money(s.deposits.returned)]),
    csvLine(['Held at period end', money(s.deposits.held)]),
    csvLine(['Paid from personal accounts (owed back to you)', money(s.paidPersonally)]),
    '',
    csvLine(['Date', 'Home', 'Type', 'Category', 'Schedule E line', 'Paid to / from', 'Description', 'Paid from', 'Amount']),
    ...r.entries.map((e) =>
      csvLine([e.date, e.home, e.type, e.label, e.line || '', e.payee, e.description, e.paidFrom === 'personal' ? 'Personal' : e.paidFrom === 'business' ? 'Business' : '', money(e.amount)]),
    ),
  );
  // A byte-order mark so Excel reads it as UTF-8.
  return '﻿' + out.join('\r\n') + '\r\n';
}
