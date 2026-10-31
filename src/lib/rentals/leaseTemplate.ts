import { createHash } from 'node:crypto';
import type { AgreementTerms } from './leasing';

/**
 * The standard Connecticut residential lease, filled in from the lease record and the landlord's
 * extra terms. Plain text with numbered sections, so the signed copy is exactly what both people
 * read. It follows Connecticut's landlord-tenant statutes (Chapter 830) as of 2026; the page tells
 * landlords to have a Connecticut attorney review it before first use.
 */

export interface LeaseFacts {
  tenantName: string;
  tenantEmail: string;
  homeName: string;
  homeAddress: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: string;
  dueDay: number;
  graceDays: number;
  lateFee: string | null;
  securityDeposit: string | null;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (v: string | number) => usd.format(Number(v));
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

const SMOKING = {
  not_allowed: 'Smoking and vaping of any substance are not allowed anywhere in the Premises.',
  outside_only: 'Smoking and vaping are allowed only outdoors, at least 15 feet from doors and windows.',
  allowed: 'Smoking is allowed. Tenant is responsible for any smoke damage beyond normal wear and tear.',
};

export function renderLease(f: LeaseFacts, t: AgreementTerms): string {
  const late = f.lateFee && Number(f.lateFee) > 0;
  const deposit = f.securityDeposit && Number(f.securityDeposit) > 0;
  const sections: [string, string][] = [
    [
      'Parties and Premises',
      `This Residential Lease ("Lease") is between ${t.landlordName} ("Landlord") and ${f.tenantName} ("Tenant"). Landlord rents to Tenant the home known as ${f.homeName}, ${f.homeAddress} (the "Premises"), to be used only as a private residence.${t.occupants ? ` The Premises will be occupied only by Tenant and: ${t.occupants}.` : ''}`,
    ],
    [
      'Term',
      f.endDate
        ? `The Lease begins on ${day(f.startDate)} and ends on ${day(f.endDate)}. If Tenant stays after the end date with Landlord's consent and no new lease is signed, the tenancy continues month to month on the same terms, and either party may end it with written notice as Connecticut law requires.`
        : `The Lease begins on ${day(f.startDate)} and continues month to month. Either party may end it with written notice given at least one full rental period in advance, or as Connecticut law otherwise requires.`,
    ],
    [
      'Rent',
      `Rent is ${money(f.monthlyRent)} per month, due in advance on the ${ordinal(f.dueDay)} day of each month. ${t.rentPaymentMethod ? `Tenant will pay rent by ${t.rentPaymentMethod}.` : 'Tenant will pay rent by a method Landlord accepts, including through the Rentals app where offered.'} Landlord will give a receipt for each payment. Rent for a partial first or last month is prorated by day.`,
    ],
    [
      'Late Charge',
      late
        ? `Rent not received within ${f.graceDays} days after it is due is late, and Tenant will owe a late charge of ${money(f.lateFee!)}. As Connecticut law (C.G.S. § 47a-15a) requires, no late charge applies until the ${f.graceDays}-day grace period has passed, and it will never exceed the lesser of $5 for each day rent is late up to $50, or 5% of the late rent.`
        : `Rent not received within ${f.graceDays} days after it is due is late. No late charge is set in this Lease.`,
    ],
    [
      'Security Deposit',
      deposit
        ? `Tenant has paid or will pay a security deposit of ${money(f.securityDeposit!)}. It will not exceed two months' rent (or one month's rent if Tenant is 62 or older), as C.G.S. § 47a-21 provides. Landlord will hold it in an escrow account in a Connecticut financial institution and pay interest as the law requires. Within 21 days after the tenancy ends, or 15 days after Tenant gives a forwarding address in writing, whichever is later, Landlord will return the deposit with interest, less any lawful deductions, with an itemized list of any damages deducted. The deposit may not be used by Tenant as the last month's rent.`
        : 'No security deposit is required.',
    ],
    [
      'Utilities and Services',
      `Tenant pays for: ${t.utilitiesTenant || 'all utilities and services not listed as paid by Landlord'}. Landlord pays for: ${t.utilitiesLandlord || 'none'}. Tenant will put utilities Tenant pays for in Tenant's own name from the start date.`,
    ],
    [
      "Landlord's Duties",
      'Landlord will comply with building and housing codes affecting health and safety; make all repairs needed to keep the Premises fit and livable; keep common areas clean and safe; keep in good working order all electrical, plumbing, heating, ventilating and other systems and appliances Landlord supplies; supply running water and reasonable heat and hot water; and provide working smoke and carbon monoxide detectors, as C.G.S. § 47a-7 requires.',
    ],
    [
      "Tenant's Duties",
      "Tenant will keep the Premises clean and safe; dispose of trash properly; use all systems and appliances reasonably; not damage the Premises or allow others to; not disturb neighbors' peaceful enjoyment; test smoke and carbon monoxide detectors and replace their batteries; and report needed repairs promptly, including through the Rentals app. Tenant pays for damage caused by Tenant, household members or guests beyond normal wear and tear.",
    ],
    [
      'Entry by Landlord',
      'Landlord may enter at reasonable times, after giving reasonable notice, to inspect, make repairs or show the Premises, as C.G.S. § 47a-16 provides. Landlord may enter without notice in an emergency. Landlord will not abuse the right of entry or use it to harass Tenant.',
    ],
    ['Pets', t.pets ? t.pets : 'No pets are allowed without Landlord\'s written consent. Assistance animals for a person with a disability are not pets and are allowed as fair housing law requires.'],
    ['Smoking', SMOKING[t.smoking]],
    ['Parking', t.parking || 'Parking is as provided by the Premises and any homeowners association rules.'],
    [
      'Rules, HOA and Alterations',
      'Tenant will follow any homeowners or condominium association rules that apply to the Premises, which Landlord will provide. Tenant will not paint, change locks, or make alterations without Landlord\'s written consent.',
    ],
    ['Assignment and Subletting', 'Tenant may not assign this Lease or sublet any part of the Premises without Landlord\'s written consent.'],
    [
      "Renter's Insurance",
      "Landlord's insurance does not cover Tenant's belongings or Tenant's liability. Tenant is encouraged to carry renter's insurance.",
    ],
    [
      'Bed Bugs',
      'Landlord is not aware of any current bed bug infestation in the Premises. Tenant will promptly tell Landlord about any suspected bed bugs, and Landlord will inspect and treat as C.G.S. § 47a-7a requires.',
    ],
    ...(t.builtBefore1978
      ? ([
          [
            'Lead-Based Paint Disclosure',
            'The Premises were built before 1978 and may contain lead-based paint. As federal law requires, before Tenant signs this Lease Landlord must give Tenant the EPA pamphlet "Protect Your Family From Lead in Your Home" and a separate lead-based paint disclosure form, signed by both, that lists any lead-based paint, hazards, records and reports known to Landlord. That signed form is part of this Lease.',
          ],
        ] as [string, string][])
      : []),
    [
      'Notices',
      `Notices to Landlord go to ${t.landlordAddress}. Notices to Tenant go to the Premises or ${f.tenantEmail}. Notices may also be sent through the Rentals app where the law allows.`,
    ],
    [
      'Ending the Lease',
      'At the end of the tenancy Tenant will return all keys and leave the Premises clean and in the same condition as at the start, except for normal wear and tear. Landlord may end the tenancy only as Connecticut law allows, through a court process.',
    ],
    ...(t.extraTerms ? ([['Additional Terms', t.extraTerms]] as [string, string][]) : []),
    [
      'Whole Agreement and Signatures',
      'This Lease is the whole agreement between Landlord and Tenant. Any change must be in writing and signed by both. If any part of this Lease is found invalid, the rest stays in effect. Connecticut law governs this Lease. Landlord and Tenant agree to sign electronically, and electronic signatures have the same effect as signatures on paper.',
    ],
  ];
  return [
    'CONNECTICUT RESIDENTIAL LEASE',
    '',
    ...sections.flatMap(([title, body], i) => [`${i + 1}. ${title.toUpperCase()}`, body, '']),
  ]
    .join('\n')
    .trim();
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
