/**
 * The steps from an empty home to a tenant living there, shown as a progress bar to the landlord and
 * the tenant. Worked out from what's already recorded; nothing here is stored.
 */
export const LEASING_STEPS = [
  { key: 'application', label: 'Application', who: 'Applicant' },
  { key: 'review', label: 'Review', who: 'You' },
  { key: 'drafting', label: 'Lease drafting', who: 'You' },
  { key: 'signing', label: 'Signing', who: 'You and tenant' },
  { key: 'movein', label: 'Move-in', who: 'You and tenant' },
  { key: 'active', label: 'Active lease', who: 'Done' },
] as const;

export type LeasingStepKey = (typeof LEASING_STEPS)[number]['key'];
export const ACTIVE_STEP = LEASING_STEPS.length - 1;

export interface LeasingInput {
  applications: { status: string }[];
  lease: { startDate: string; tenantId: string | null; agreement: { status: 'draft' | 'sent' | 'signed' } | null } | null;
  /** Move-in inspection papers or photos uploaded for this lease. */
  inspections: number;
  today: string;
}

/** Which step the home is on, 0 to 5. */
export function landlordStep({ applications, lease, inspections, today }: LeasingInput): number {
  if (!lease) {
    if (applications.some((a) => a.status === 'approved')) return 2;
    if (applications.some((a) => a.status === 'new' || a.status === 'reviewing')) return 1;
    return 0;
  }
  const agreement = lease.agreement;
  // A lease added before written leases were in the app, already running: nothing left to walk through.
  if (!agreement && lease.startDate <= today) return ACTIVE_STEP;
  if (!agreement || agreement.status === 'draft') return 2;
  if (agreement.status === 'sent') return 3;
  if (!lease.tenantId || inspections === 0) return 4;
  return ACTIVE_STEP;
}

/** The same bar for the tenant, who joins once the lease is written. */
export function tenantStep({ agreement, startDate, today }: { agreement: { status: 'sent' | 'signed' } | null; startDate: string; today: string }): number {
  if (agreement?.status === 'sent') return 3;
  if (agreement?.status === 'signed' && startDate > today) return 4;
  return ACTIVE_STEP;
}
