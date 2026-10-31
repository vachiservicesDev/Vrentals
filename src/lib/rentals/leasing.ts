import { z } from 'zod';

// Input rules for listings, showings and applications. No database or browser code here.

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date, like 2026-01-31.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Enter a real date.');
const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const optional = (max: number) => text(max).optional();
const money = z.coerce.number({ invalid_type_error: 'Enter an amount.' }).min(0, 'Enter zero or more.').max(1_000_000, 'That amount looks too large.');
const blankable = <T extends z.ZodTypeAny>(t: T) => z.union([z.literal(''), t]).optional();
const email = z.string().trim().toLowerCase().email('Enter a valid email.').max(255);
const phone = z.string().trim().regex(/^[\d\s()+.-]{7,30}$/, 'Enter a phone number.');

export const listingSchema = z.object({
  active: z.boolean().default(true),
  headline: optional(150),
  description: optional(5000),
  askingRent: money.refine((v) => v > 0, 'Enter the monthly rent.'),
  securityDeposit: blankable(money),
  availableFrom: blankable(day),
  bedrooms: blankable(z.coerce.number().min(0).max(20)),
  bathrooms: blankable(z.coerce.number().min(0).max(20)),
  squareFeet: blankable(z.coerce.number().int().min(0).max(100000)),
  petPolicy: optional(200),
});

/** Showing times to add: one date, one or more start times (HH:MM, Eastern), and how long each lasts. */
export const slotsSchema = z.object({
  date: day,
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 17:30.')).min(1, 'Add at least one time.').max(24),
  minutes: z.coerce.number().int().min(10).max(180).default(30),
});

export const bookingSchema = z.object({
  slotId: z.string().uuid('Pick a time.'),
  name: text(200).min(1, 'Enter your name.'),
  email,
  phone: phone.optional().or(z.literal('')),
  note: optional(1000),
});

/**
 * A rental application. It asks for what a landlord may lawfully use to decide (identity to contact,
 * rental and work history, income, household size, pets, references) and nothing about protected
 * traits. Source of income (including vouchers) is a protected class in Connecticut, so income is
 * asked as an amount from any source.
 */
export const applicationSchema = z.object({
  fullName: text(200).min(1, 'Enter your full name.'),
  email,
  phone,
  moveInDate: blankable(day),
  currentAddress: text(500).min(1, 'Enter where you live now.'),
  currentSince: optional(50),
  currentRent: blankable(money),
  currentLandlordName: optional(200),
  currentLandlordPhone: optional(30),
  reasonForMoving: optional(1000),
  previousAddress: optional(500),
  employer: optional(200),
  jobTitle: optional(150),
  employedSince: optional(50),
  monthlyIncome: money.refine((v) => v > 0, 'Enter your total monthly income.'),
  incomeNotes: optional(1000),
  adults: z.coerce.number().int().min(1, 'At least one adult.').max(20),
  children: z.coerce.number().int().min(0).max(20).default(0),
  pets: optional(500),
  vehicles: optional(300),
  referenceName: optional(200),
  referencePhone: optional(30),
  evictionHistory: z.enum(['no', 'yes']),
  evictionDetails: optional(1000),
  additionalInfo: optional(2000),
  certify: z.literal(true, { errorMap: () => ({ message: 'Confirm that your answers are true.' }) }),
  signedName: text(200).min(1, 'Type your full name to sign.'),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

export const APPLICATION_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
] as const;

export const applicationUpdateSchema = z.object({
  status: z.enum(['new', 'reviewing', 'approved', 'declined']).optional(),
  landlordNotes: optional(5000),
});

/** What the landlord adds to the standard lease. */
export const agreementTermsSchema = z.object({
  landlordName: text(200).min(1, 'Enter the landlord name for the lease.'),
  landlordAddress: text(500).min(1, 'Enter an address where the tenant can send notices.'),
  occupants: optional(500),
  utilitiesTenant: optional(500),
  utilitiesLandlord: optional(500),
  parking: optional(300),
  pets: optional(500),
  smoking: z.enum(['not_allowed', 'allowed', 'outside_only']).default('not_allowed'),
  builtBefore1978: z.boolean().default(false),
  rentPaymentMethod: optional(300),
  extraTerms: optional(10000),
});

export type AgreementTerms = z.infer<typeof agreementTermsSchema>;

export const signSchema = z.object({
  signedName: text(200).min(1, 'Type your full name to sign.'),
  consent: z.literal(true, { errorMap: () => ({ message: 'Agree to sign electronically.' }) }),
});

/** Ignore near-matches in typed names ("ravi  peddyreddy" signs for "Ravi Peddyreddy"). */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFKD').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  return norm(a) === norm(b);
}
