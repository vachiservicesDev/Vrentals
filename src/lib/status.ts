import type { Tone } from '@/components/ui/ui';

// Plain-English labels and chip tones for every status the database stores.
// Green ("live") is kept for paid / done.

type Entry = { label: string; tone: Tone };

const STATUSES: Record<string, Record<string, Entry>> = {
  rent: {
    upcoming: { label: 'Not due yet', tone: 'draft' },
    due: { label: 'Due', tone: 'new' },
    partial: { label: 'Part paid', tone: 'warning' },
    late: { label: 'Late', tone: 'danger' },
    paid: { label: 'Paid', tone: 'live' },
  },
  repair: {
    open: { label: 'Needs scheduling', tone: 'new' },
    scheduled: { label: 'Visit scheduled', tone: 'info' },
    done: { label: 'Fixed', tone: 'live' },
    cancelled: { label: 'Cancelled', tone: 'muted' },
  },
  repairUrgency: {
    low: { label: 'Low', tone: 'muted' },
    normal: { label: 'Normal', tone: 'draft' },
    urgent: { label: 'Urgent', tone: 'danger' },
  },
  lease: {
    active: { label: 'Active', tone: 'live' },
    ended: { label: 'Ended', tone: 'muted' },
  },
};

export type StatusKind = keyof typeof STATUSES;

function humanize(value: string): string {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusOf(kind: StatusKind, value: string | null | undefined): Entry {
  if (!value) return { label: '—', tone: 'muted' };
  return STATUSES[kind]?.[value] ?? { label: humanize(value), tone: 'muted' };
}

export function labelFrom(list: { value: string; label: string }[], value: string | null | undefined): string {
  return list.find((o) => o.value === value)?.label ?? (value ? humanize(value) : '—');
}

export const REPAIR_STATUSES = Object.entries(STATUSES.repair).map(([value, e]) => ({ value, label: e.label }));

export const REPAIR_URGENCIES = [
  { value: 'normal', label: 'Normal: in the next few days' },
  { value: 'urgent', label: 'Urgent: no heat, no water, a leak, unsafe' },
  { value: 'low', label: 'Low: whenever convenient' },
];

export const REMINDER_KINDS = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'hoa', label: 'HOA dues' },
  { value: 'tax', label: 'Property tax' },
  { value: 'other', label: 'Other' },
];

export const REMINDER_REPEATS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
];

export const PAYMENT_METHODS = [
  { value: 'zelle', label: 'Zelle' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Check' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];
