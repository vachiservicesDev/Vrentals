import { addDays, todayEastern } from '@/lib/dates';

/**
 * Landlord plans, the way VTrack licenses companies: Vachi staff set how many homes a landlord can
 * have and until when, on /platform. A new sign-up starts on a trial. Accounts with no limit and no
 * end date (like the Vachi owners' own) are free and unlimited.
 */
export const TRIAL_HOMES = 2;
export const TRIAL_DAYS = 30;

export interface Plan {
  homeLimit: number | null;
  planExpires: string | null;
}

export const trialPlan = (today = todayEastern()): Plan => ({ homeLimit: TRIAL_HOMES, planExpires: addDays(today, TRIAL_DAYS) });

/** Past its end date: the landlord can still see everything but can't change anything. */
export function planLapsed(plan: Plan, today = todayEastern()): boolean {
  return !!plan.planExpires && plan.planExpires < today;
}

export function canAddHome(plan: Plan, homes: number): boolean {
  return plan.homeLimit === null || homes < plan.homeLimit;
}

export function planLabel(plan: Plan): string {
  if (plan.homeLimit === null && !plan.planExpires) return 'Free, unlimited';
  const homes = plan.homeLimit === null ? 'Unlimited homes' : `Up to ${plan.homeLimit} ${plan.homeLimit === 1 ? 'home' : 'homes'}`;
  return plan.planExpires ? `${homes}, through ${plan.planExpires}` : homes;
}

export const LAPSED_MESSAGE = 'Your Rentals plan has ended, so your homes are read-only. Contact Vachi Services to renew it.';
