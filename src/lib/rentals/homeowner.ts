// Money for a home the owner lives in. No database access here, so the year-end summary can be
// tested on plain rows and built the same way for the page and the CSV.
//
// A home you live in isn't a business, so most of its costs aren't deductible. What the IRS does
// care about at year end:
//   - Schedule A (itemized deductions): mortgage interest and points (line 8a), mortgage insurance
//     (line 8d, from tax year 2026), and real estate tax (line 5b, inside the state and local tax cap).
//   - Cost basis: what the home cost plus improvements. It lowers the taxable gain when you sell.
//   - Energy credits (Form 5695): 30% of qualifying upgrades installed from 2023 through 2025.
//     The One Big Beautiful Bill Act ended both credits for anything installed after 2025.
//   - Home office (Form 8829 or the simplified method): only for self-employed work. W-2
//     employees can't deduct a home office.
// Figures are for planning. The preparer's numbers are the ones that get filed.

import type { Category } from './money';

export const PROPERTY_USES = [
  { value: 'rental', label: 'I rent it out' },
  { value: 'own', label: 'I live here (my own home)' },
] as const;
export type PropertyUse = (typeof PROPERTY_USES)[number]['value'];

/** How a cost on your own home is treated at tax time. */
export type HomeTreatment = 'schedule_a' | 'office_share' | 'none';

export interface HomeCategory extends Category {
  treatment: HomeTreatment;
  /** Where it goes, in words, e.g. "Schedule A line 8a". */
  form?: string;
}

export const HOME_EXPENSE_CATEGORIES: HomeCategory[] = [
  { value: 'mortgage_interest', label: 'Mortgage interest', line: 0, treatment: 'schedule_a', form: 'Schedule A line 8a', hint: 'Interest only. Your lender sends Form 1098 in January with the year total.' },
  { value: 'points', label: 'Points on your mortgage', line: 0, treatment: 'schedule_a', form: 'Schedule A line 8a', hint: 'Loan points (discount points) for buying or building your main home, from your closing statement.' },
  { value: 'mortgage_insurance', label: 'Mortgage insurance (PMI)', line: 0, treatment: 'schedule_a', form: 'Schedule A line 8d', hint: 'Deductible again from tax year 2026. Phases out above $100,000 of income.' },
  { value: 'property_tax', label: 'Property tax', line: 0, treatment: 'schedule_a', form: 'Schedule A line 5b', hint: 'Town real estate tax. Counts toward the state and local tax (SALT) cap.' },
  { value: 'mortgage_principal', label: 'Mortgage principal', line: 0, treatment: 'none', hint: 'The part of your payment that pays down the loan. Not deductible; tracked so you see the whole payment.' },
  { value: 'insurance', label: "Homeowner's insurance", line: 0, treatment: 'office_share', hint: 'Not deductible for your own home, except the home office share if you are self-employed.' },
  { value: 'hoa', label: 'HOA dues', line: 0, treatment: 'office_share' },
  { value: 'utilities', label: 'Utilities', line: 0, treatment: 'office_share', hint: 'Electric, gas, water, sewer, trash, internet.' },
  { value: 'repairs', label: 'Repairs', line: 0, treatment: 'office_share', hint: 'Fixing what broke. Not deductible for your own home, and does not add to cost basis.' },
  { value: 'maintenance', label: 'Maintenance', line: 0, treatment: 'office_share', hint: 'Lawn, snow removal, pest control, HVAC servicing, cleaning.' },
  { value: 'other', label: 'Other home cost', line: 0, treatment: 'none' },
];

export const HOME_CAPITAL_CATEGORIES: HomeCategory[] = [
  { value: 'improvement', label: 'Home improvement', line: 0, treatment: 'none', hint: 'Adds value or lasts for years: new roof, kitchen remodel, addition, deck, fence, central air. Adds to your cost basis.' },
  {
    value: 'energy_efficiency',
    label: 'Energy-saving upgrade',
    line: 0,
    treatment: 'none',
    hint: 'Insulation, windows, doors, heat pump, efficient furnace or water heater. 30% credit if installed 2023 to 2025; also adds to cost basis.',
  },
  { value: 'clean_energy', label: 'Solar, battery or geothermal', line: 0, treatment: 'none', hint: 'Solar panels, solar water heating, battery storage, geothermal. 30% credit if installed 2023 to 2025; also adds to cost basis.' },
];

export const HOME_TRANSACTION_TYPES = [
  { value: 'expense', label: 'Payment or expense' },
  { value: 'capital', label: 'Improvement (adds to cost basis)' },
] as const;

export function homeCategoryOf(type: string, category: string): HomeCategory | undefined {
  const list = type === 'expense' ? HOME_EXPENSE_CATEGORIES : type === 'capital' ? HOME_CAPITAL_CATEGORIES : [];
  return list.find((c) => c.value === category);
}

// --- Tax-year figures --------------------------------------------------------------------------

/** Standard deduction by filing status. 2025 and 2026 as set by the One Big Beautiful Bill Act and IRS Rev. Proc. 2025-32. */
export const STANDARD_DEDUCTION: Record<number, { single: number; mfj: number; hoh: number }> = {
  2024: { single: 14_600, mfj: 29_200, hoh: 21_900 },
  2025: { single: 15_750, mfj: 31_500, hoh: 23_625 },
  2026: { single: 16_100, mfj: 32_200, hoh: 24_150 },
};

/**
 * The state and local tax (SALT) cap: property tax plus state income (or sales) tax, together.
 * $10,000 through 2024; $40,000 for 2025 rising 1% a year through 2029, then back to $10,000.
 * Half for married filing separately. Above the income threshold the cap shrinks by 30% of the
 * excess, never below $10,000.
 */
export function saltCap(year: number): { cap: number; separate: number; phaseOutAbove: number | null } {
  if (year < 2025 || year > 2029) return { cap: 10_000, separate: 5_000, phaseOutAbove: null };
  const steps = year - 2025;
  const cap = Math.round(40_000 * 1.01 ** steps);
  const above = Math.round(500_000 * 1.01 ** steps);
  return { cap, separate: Math.round(cap / 2), phaseOutAbove: above };
}

/** Mortgage insurance premiums: not deductible 2022 to 2025; deductible again from 2026. */
export const pmiDeductible = (year: number) => year >= 2026 || year <= 2021;

/** Energy credits (Form 5695) apply to items installed in 2023, 2024 or 2025 at 30%. */
export const energyCreditYear = (year: number) => year >= 2023 && year <= 2025;

/** Energy Efficient Home Improvement Credit (25C): yearly limits. */
export const EFFICIENCY_CREDIT_LIMIT = 1_200;
export const EFFICIENCY_CREDIT_LIMIT_WITH_HEAT_PUMP = 3_200;

/** Simplified home office method: $5 a square foot, up to 300 square feet. */
export const SIMPLIFIED_OFFICE_RATE = 5;
export const SIMPLIFIED_OFFICE_MAX_SQFT = 300;

/** Gain you can leave out of income when you sell a main home you owned and lived in 2 of the last 5 years. */
export const SALE_EXCLUSION = { single: 250_000, mfj: 500_000 };

// --- The year-end summary ----------------------------------------------------------------------

export interface HomeLedgerRow {
  type: string;
  category: string;
  date: string;
  amount: string | number;
}

export interface HomeInfo {
  purchasePrice: string | number | null;
  /** The day you bought it (stored in placed_in_service). */
  purchaseDate: string | null;
  homeSqft: number | null;
  officeSqft: number | null;
}

export interface HomeLine {
  category: string;
  label: string;
  form?: string;
  amount: number;
  note?: string;
}

export interface HomeTaxSummary {
  year: number;
  /** Everything paid this year, by category. */
  spending: HomeLine[];
  totalSpending: number;
  /** What can go on Schedule A if you itemize. */
  scheduleA: HomeLine[];
  totalScheduleA: number;
  /** Costs that aren't deductible for a home you live in. */
  notDeductible: HomeLine[];
  pmiNotDeductible: number;
  salt: { propertyTax: number; cap: number; separate: number; phaseOutAbove: number | null };
  standardDeduction: { single: number; mfj: number; hoh: number } | null;
  improvementsThisYear: HomeLine[];
  totalImprovementsThisYear: number;
  basis: {
    purchasePrice: number | null;
    improvementsToDate: number;
    energyCreditsToDate: number;
    /** Purchase price + improvements − energy credits claimed. Null without a purchase price. */
    adjusted: number | null;
  };
  energy: {
    eligible: boolean;
    efficiencySpent: number;
    /** 30% of the cost, capped at the general yearly limit. Heat pumps can raise the cap; see the note. */
    efficiencyCredit: number;
    cleanSpent: number;
    cleanCredit: number;
  };
  office: null | {
    sqft: number;
    homeSqft: number;
    percent: number;
    simplified: number;
    /** The business share of the costs below, for the regular method (Form 8829). */
    regularShare: number;
    regularLines: HomeLine[];
  };
}

const cents = (v: string | number) => Math.round(Number(v) * 100);
const dollars = (c: number) => c / 100;

/**
 * The year-end summary for one home you live in (or several added together). `ledger` is every
 * entry up to the end of `year`: the year's own entries are totalled for the year, and every
 * improvement up to then counts toward cost basis.
 */
export function buildHomeTaxSummary(ledger: HomeLedgerRow[], info: HomeInfo, year: number): HomeTaxSummary {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const thisYear = (d: string) => d >= from && d <= to;

  const spent = new Map<string, number>();
  const improved = new Map<string, number>();
  let improvementsToDate = 0;
  let energyCreditsToDate = 0;
  const creditByYear = new Map<number, { eff: number; clean: number }>();

  for (const row of ledger) {
    if (row.date > to) continue;
    const c = cents(row.amount);
    if (row.type === 'capital') {
      improvementsToDate += c;
      const y = Number(row.date.slice(0, 4));
      if (energyCreditYear(y) && (row.category === 'energy_efficiency' || row.category === 'clean_energy')) {
        const e = creditByYear.get(y) ?? { eff: 0, clean: 0 };
        if (row.category === 'energy_efficiency') e.eff += c;
        else e.clean += c;
        creditByYear.set(y, e);
      }
      if (thisYear(row.date)) improved.set(row.category, (improved.get(row.category) ?? 0) + c);
    } else if (row.type === 'expense' && thisYear(row.date)) {
      spent.set(row.category, (spent.get(row.category) ?? 0) + c);
    }
  }

  const efficiencyCredit = (spentCents: number) => Math.min(Math.round(spentCents * 0.3), EFFICIENCY_CREDIT_LIMIT * 100);
  const cleanCredit = (spentCents: number) => Math.round(spentCents * 0.3);
  // The credit you claim lowers the home's basis (IRC 25C(g), 25D(f)).
  for (const e of creditByYear.values()) energyCreditsToDate += efficiencyCredit(e.eff) + cleanCredit(e.clean);

  const line = (type: 'expense' | 'capital', category: string, c: number): HomeLine => {
    const cat = homeCategoryOf(type, category);
    return { category, label: cat?.label ?? category, form: cat?.form, amount: dollars(c) };
  };
  const byAmount = (a: HomeLine, b: HomeLine) => b.amount - a.amount;
  const sum = (lines: HomeLine[]) => dollars(lines.reduce((a, l) => a + cents(l.amount), 0));

  const spending = [...spent.entries()].map(([k, c]) => line('expense', k, c)).sort(byAmount);
  const pmiOk = pmiDeductible(year);
  const scheduleA = spending.filter((l) => homeCategoryOf('expense', l.category)?.treatment === 'schedule_a' && (l.category !== 'mortgage_insurance' || pmiOk));
  const notDeductible = spending.filter((l) => !scheduleA.includes(l));
  const pmiNotDeductible = pmiOk ? 0 : dollars(spent.get('mortgage_insurance') ?? 0);
  const improvementsThisYear = [...improved.entries()].map(([k, c]) => line('capital', k, c)).sort(byAmount);

  const eligible = energyCreditYear(year);
  const effSpent = improved.get('energy_efficiency') ?? 0;
  const cleanSpent = improved.get('clean_energy') ?? 0;

  const purchasePrice = info.purchasePrice === null || info.purchasePrice === '' ? null : Number(info.purchasePrice);
  const owned = !info.purchaseDate || info.purchaseDate <= to;

  let office: HomeTaxSummary['office'] = null;
  if (info.officeSqft && info.homeSqft && info.officeSqft > 0 && info.homeSqft > 0 && owned) {
    const sqft = Math.min(info.officeSqft, info.homeSqft);
    const share = sqft / info.homeSqft;
    // Costs of running the whole home (indirect expenses on Form 8829). Principal never counts.
    const regularLines = spending
      .filter((l) => {
        const t = homeCategoryOf('expense', l.category)?.treatment;
        return t === 'office_share' || (t === 'schedule_a' && l.category !== 'points');
      })
      .map((l) => ({ ...l, amount: Math.round(l.amount * share * 100) / 100 }));
    office = {
      sqft,
      homeSqft: info.homeSqft,
      percent: Math.round(share * 1000) / 10,
      simplified: Math.min(sqft, SIMPLIFIED_OFFICE_MAX_SQFT) * SIMPLIFIED_OFFICE_RATE,
      regularShare: sum(regularLines),
      regularLines,
    };
  }

  const cap = saltCap(year);
  return {
    year,
    spending,
    totalSpending: sum(spending),
    scheduleA,
    totalScheduleA: sum(scheduleA),
    notDeductible,
    pmiNotDeductible,
    salt: { propertyTax: dollars(spent.get('property_tax') ?? 0), ...cap },
    standardDeduction: STANDARD_DEDUCTION[year] ?? null,
    improvementsThisYear,
    totalImprovementsThisYear: sum(improvementsThisYear),
    basis: {
      purchasePrice,
      improvementsToDate: dollars(improvementsToDate),
      energyCreditsToDate: dollars(energyCreditsToDate),
      adjusted: purchasePrice === null ? null : dollars(cents(purchasePrice) + improvementsToDate - energyCreditsToDate),
    },
    energy: {
      eligible,
      efficiencySpent: dollars(effSpent),
      efficiencyCredit: eligible ? dollars(efficiencyCredit(effSpent)) : 0,
      cleanSpent: dollars(cleanSpent),
      cleanCredit: eligible ? dollars(cleanCredit(cleanSpent)) : 0,
    },
    office,
  };
}
