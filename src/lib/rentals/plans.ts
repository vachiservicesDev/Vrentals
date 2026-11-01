import { todayEastern } from '@/lib/dates';

/**
 * Licenses, the way VTrack licenses companies: Vachi staff set how many homes a landlord or
 * homeowner can have, until when, and whether it's paid, on /platform. Sign-up is invite-only, and
 * each invitation link carries the license the new account starts with. Accounts with no limit and
 * no end date (like the Vachi owners' own) are unlimited.
 */

export interface Plan {
  homeLimit: number | null;
  planExpires: string | null;
}

export type LicenseStatus = 'suspended' | 'expired' | 'paid' | 'trial' | 'free';

/**
 * One word for where an account stands, for the admin page: suspended (can't sign in), expired
 * (past its end date, read-only), paid, trial (unpaid with an end date) or free (unpaid, no end).
 */
export function licenseStatus(a: Plan & { planPaid: boolean; isActive: boolean }, today = todayEastern()): LicenseStatus {
  if (!a.isActive) return 'suspended';
  if (planLapsed(a, today)) return 'expired';
  if (a.planPaid) return 'paid';
  return a.planExpires ? 'trial' : 'free';
}

/** Past its end date: the landlord can still see everything but can't change anything. */
export function planLapsed(plan: Plan, today = todayEastern()): boolean {
  return !!plan.planExpires && plan.planExpires < today;
}

export function canAddHome(plan: Plan, homes: number): boolean {
  return plan.homeLimit === null || homes < plan.homeLimit;
}

export function planLabel(plan: Plan): string {
  if (plan.homeLimit === null && !plan.planExpires) return 'Unlimited, no end date';
  const homes = plan.homeLimit === null ? 'Unlimited homes' : `Up to ${plan.homeLimit} ${plan.homeLimit === 1 ? 'home' : 'homes'}`;
  return plan.planExpires ? `${homes}, through ${plan.planExpires}` : homes;
}

export const LAPSED_MESSAGE = 'Your Vrentals plan has ended, so your homes are read-only. Contact Vachi Services to renew it.';
