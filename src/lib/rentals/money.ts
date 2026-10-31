// Categories for the money ledger and the profit & loss math. No database access here, so the
// statement can be tested on plain rows and built the same way for the page and the CSV.
//
// Categories follow IRS Schedule E (Form 1040), Part I, the form residential rental income and
// expenses go on. `line` is the Schedule E line number each one is totalled on.

export interface Category {
  value: string;
  label: string;
  line: number;
  hint?: string;
}

export const SCHEDULE_E_LINES: Record<number, string> = {
  3: 'Rents received',
  5: 'Advertising',
  6: 'Auto and travel',
  7: 'Cleaning and maintenance',
  8: 'Commissions',
  9: 'Insurance',
  10: 'Legal and other professional fees',
  11: 'Management fees',
  12: 'Mortgage interest paid to banks, etc.',
  13: 'Other interest',
  14: 'Repairs',
  15: 'Supplies',
  16: 'Taxes',
  17: 'Utilities',
  18: 'Depreciation expense',
  19: 'Other',
};

export const EXPENSE_CATEGORIES: Category[] = [
  { value: 'repairs', label: 'Repairs', line: 14, hint: 'Fixing what broke: plumber, electrician, patching, a part.' },
  { value: 'replacements', label: 'Small replacements', line: 19, hint: 'Like-for-like items up to $2,500 each (IRS de minimis safe harbor): a dishwasher, a faucet, blinds.' },
  { value: 'cleaning', label: 'Cleaning', line: 7, hint: 'Turnover cleaning, carpet cleaning.' },
  { value: 'maintenance', label: 'Maintenance', line: 7, hint: 'Lawn care, snow removal, pest control, HVAC servicing.' },
  { value: 'hoa', label: 'HOA dues', line: 19 },
  { value: 'insurance', label: 'Insurance', line: 9, hint: 'Landlord (dwelling) policy, umbrella, flood.' },
  { value: 'property_tax', label: 'Property tax', line: 16, hint: 'Town real estate tax and rental licenses.' },
  { value: 'mortgage_interest', label: 'Mortgage interest', line: 12, hint: 'Interest only, from your Form 1098. Principal is not an expense.' },
  { value: 'other_interest', label: 'Other interest', line: 13, hint: 'Interest on a loan or card used for the rental.' },
  { value: 'utilities', label: 'Utilities', line: 17, hint: 'Water, sewer, trash, gas or electric you pay.' },
  { value: 'supplies', label: 'Supplies', line: 15, hint: 'Light bulbs, filters, smoke detectors, locks.' },
  { value: 'advertising', label: 'Advertising', line: 5, hint: 'Listing fees, signs, screening services.' },
  { value: 'commissions', label: 'Leasing commissions', line: 8, hint: 'Paid to an agent for finding a tenant.' },
  { value: 'management', label: 'Management fees', line: 11 },
  { value: 'legal_professional', label: 'Legal and accounting', line: 10, hint: 'Attorney, eviction, tax preparation for the rental.' },
  { value: 'travel', label: 'Auto and travel', line: 6, hint: 'Trips to the property: actual costs or miles × the IRS rate.' },
  { value: 'bank_fees', label: 'Bank and software fees', line: 19 },
  { value: 'other', label: 'Other expense', line: 19 },
];

/** Everything tenants pay besides deposits counts as rents received (Schedule E line 3). */
export const INCOME_CATEGORIES: Category[] = [
  { value: 'late_fee', label: 'Late fees', line: 3 },
  { value: 'tenant_fees', label: 'Pet, parking and other tenant fees', line: 3 },
  { value: 'deposit_kept', label: 'Deposit kept for damages or rent', line: 3, hint: 'Becomes income when you keep it.' },
  { value: 'other', label: 'Other rental income', line: 3 },
];

/** Deposits belong to the tenant while you hold them, so they're tracked apart from profit. */
export const DEPOSIT_CATEGORIES: Category[] = [
  { value: 'received', label: 'Deposit received', line: 0 },
  { value: 'returned', label: 'Deposit returned', line: 0 },
];

/** Improvements are depreciated over years, not deducted in the year they're paid. */
export const CAPITAL_CATEGORIES: Category[] = [
  { value: 'building', label: 'Improvement to the building', line: 0, hint: 'Roof, HVAC, windows, a remodel. Depreciated over 27.5 years.' },
  { value: 'appliances', label: 'Appliances, carpet and furniture', line: 0, hint: 'Over $2,500 each. Depreciated over 5 years.' },
  { value: 'land_improvement', label: 'Land improvements', line: 0, hint: 'Fence, driveway, landscaping. Depreciated over 15 years.' },
];

export const TRANSACTION_TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'capital', label: 'Improvement (depreciated)' },
  { value: 'deposit', label: 'Security deposit' },
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number]['value'];

export const CATEGORIES: Record<TransactionType, Category[]> = {
  expense: EXPENSE_CATEGORIES,
  income: INCOME_CATEGORIES,
  capital: CAPITAL_CATEGORIES,
  deposit: DEPOSIT_CATEGORIES,
};

export function categoryOf(type: string, category: string): Category | undefined {
  return CATEGORIES[type as TransactionType]?.find((c) => c.value === category);
}

export function categoryLabel(type: string, category: string): string {
  return categoryOf(type, category)?.label ?? category;
}

export const PAID_FROM = [
  { value: 'business', label: 'Business account' },
  { value: 'personal', label: 'Personal card or account' },
] as const;

/** What a bill reminder's type becomes when it's paid. */
export const REMINDER_EXPENSE_CATEGORY: Record<string, string> = { insurance: 'insurance', hoa: 'hoa', tax: 'property_tax', other: 'other' };

export interface LedgerRow {
  propertyId: string;
  type: string;
  category: string;
  date: string;
  amount: string | number;
  paidFrom?: string;
}

/** A rent month that has money recorded against it. */
export interface RentRow {
  propertyId: string;
  period: string;
  paidOn: string | null;
  paidAmount: string | number;
}

export interface StatementLine {
  category: string;
  label: string;
  line: number;
  amount: number;
}

export interface Statement {
  from: string;
  to: string;
  income: StatementLine[];
  totalIncome: number;
  expenses: StatementLine[];
  totalExpenses: number;
  /** Income minus expenses, before depreciation. */
  net: number;
  /** Totals by Schedule E line (3 and 5 to 19), with line 18 left to the caller. */
  scheduleE: { line: number; label: string; amount: number }[];
  /** Expenses paid from the owner's own card or account: what the business owes them back. */
  paidPersonally: number;
  improvements: StatementLine[];
  totalImprovements: number;
  deposits: { received: number; returned: number; held: number };
}

const cents = (v: string | number) => Math.round(Number(v) * 100);
const dollars = (c: number) => c / 100;

/**
 * When rent counts: the day it was paid, or the month it's for when no date was recorded.
 * A month paid in several parts counts on the last payment's date.
 */
export function rentDate(r: RentRow): string {
  return r.paidOn ?? r.period;
}

/**
 * Profit and loss for `from`..`to` (inclusive, YYYY-MM-DD), on the cash basis individual
 * landlords file on: rent when it was received, everything else on its date. Improvements and
 * deposits don't count toward profit. Deposits show what came in, went back, and is still held
 * (all time, up to `to`).
 */
export function buildStatement(rent: RentRow[], ledger: LedgerRow[], from: string, to: string): Statement {
  const inRange = (d: string) => d >= from && d <= to;

  const income = new Map<string, number>();
  const rentCents = rent.filter((r) => inRange(rentDate(r))).reduce((sum, r) => sum + cents(r.paidAmount), 0);
  if (rentCents) income.set('rent', rentCents);
  const expenses = new Map<string, number>();
  const improvements = new Map<string, number>();
  let received = 0;
  let returned = 0;
  let personal = 0;

  for (const row of ledger) {
    if (row.type === 'deposit') {
      if (row.date > to) continue;
      if (row.category === 'received') received += cents(row.amount);
      else if (row.category === 'returned') returned += cents(row.amount);
      continue;
    }
    if (!inRange(row.date)) continue;
    const bucket = row.type === 'income' ? income : row.type === 'expense' ? expenses : row.type === 'capital' ? improvements : null;
    bucket?.set(row.category, (bucket.get(row.category) ?? 0) + cents(row.amount));
    if (row.type !== 'income' && row.paidFrom === 'personal') personal += cents(row.amount);
  }

  const lines = (m: Map<string, number>, type: TransactionType) =>
    [...m.entries()]
      .map(([category, c]) => {
        const cat = category === 'rent' ? { label: 'Rent', line: 3 } : categoryOf(type, category) ?? { label: category, line: type === 'income' ? 3 : 19 };
        return { category, label: cat.label, line: cat.line, amount: dollars(c) };
      })
      .sort((a, b) => b.amount - a.amount);
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  const incomeLines = lines(income, 'income').sort((a, b) => (a.category === 'rent' ? -1 : b.category === 'rent' ? 1 : b.amount - a.amount));
  const expenseLines = lines(expenses, 'expense');

  const byLine = new Map<number, number>();
  for (const l of [...incomeLines, ...expenseLines]) byLine.set(l.line, (byLine.get(l.line) ?? 0) + cents(l.amount));
  const scheduleE = [...byLine.entries()].sort(([a], [b]) => a - b).map(([line, c]) => ({ line, label: SCHEDULE_E_LINES[line] ?? 'Other', amount: dollars(c) }));

  return {
    from,
    to,
    income: incomeLines,
    totalIncome: dollars(sum(income)),
    expenses: expenseLines,
    totalExpenses: dollars(sum(expenses)),
    net: dollars(sum(income) - sum(expenses)),
    scheduleE,
    paidPersonally: dollars(personal),
    improvements: lines(improvements, 'capital'),
    totalImprovements: dollars(sum(improvements)),
    deposits: { received: dollars(received), returned: dollars(returned), held: dollars(received - returned) },
  };
}

/**
 * Residential rental property depreciation for one tax year: straight line over 27.5 years with
 * the mid-month convention (IRS Pub. 527, MACRS GDS). The building's basis is what it cost less
 * the land, which never depreciates. An estimate for planning; the preparer's figure is the one
 * that's filed.
 */
export function buildingDepreciation(basis: number, placedInService: string, year: number): number {
  if (!(basis > 0)) return 0;
  const [y, m] = placedInService.split('-').map(Number);
  if (year < y) return 0;
  const yearly = basis / 27.5;
  // Months of use in each year: the first counts from the middle of its month.
  const firstYear = (12 - m + 0.5) / 12;
  const before = year === y ? 0 : firstYear + (year - y - 1);
  const thisYear = year === y ? firstYear : 1;
  const remaining = Math.max(0, 27.5 - before);
  return Math.round(yearly * Math.min(thisYear, remaining) * 100) / 100;
}

/** Days from `from` to `to` (inclusive) covered by at least one lease. */
export function rentalDays(leases: { startDate: string; endDate: string | null }[], from: string, to: string): number {
  const day = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const ranges = leases
    .map((l) => [Math.max(start, Date.parse(`${l.startDate}T00:00:00Z`)), Math.min(end, l.endDate ? Date.parse(`${l.endDate}T00:00:00Z`) : end)] as const)
    .filter(([a, b]) => a <= b)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let reach = -Infinity;
  for (const [a, b] of ranges) {
    const s = Math.max(a, reach + day);
    if (b >= s) total += Math.round((b - s) / day) + 1;
    reach = Math.max(reach, b);
  }
  return total;
}

/** One CSV field, quoted when it needs to be, and safe to open in a spreadsheet. */
export function csvField(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // A leading =, +, - or @ would run as a formula in Excel or Sheets. Numbers are left alone.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',');
}
