// The words of rent receipts and reminders, shared by the in-app notification, the email and the
// text message the landlord sends from their own phone. No database or browser code here.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (v: string | number) => usd.format(Number(v));
const month = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || '';

const METHODS: Record<string, string> = { zelle: 'Zelle', bank_transfer: 'bank transfer', check: 'check', cash: 'cash', card: 'card', other: 'other' };

export interface ReceiptFacts {
  tenantName: string;
  landlordName: string | null;
  home: string;
  period: string;
  amount: string | number;
  paidAmount: string | number;
  paidOn: string | null;
  paymentMethod: string | null;
}

export function balanceOf(f: { amount: string | number; paidAmount: string | number }): number {
  return Math.max(0, Math.round((Number(f.amount) - Number(f.paidAmount)) * 100) / 100);
}

/** Short receipt number a tenant can quote: the month and the first characters of the record's id. */
export function receiptNumber(id: string, period: string): string {
  return `R-${period.slice(0, 7).replace('-', '')}-${id.slice(0, 6).toUpperCase()}`;
}

export function receiptText(f: ReceiptFacts, url?: string): string {
  const balance = balanceOf(f);
  const how = f.paymentMethod ? ` by ${METHODS[f.paymentMethod] ?? f.paymentMethod}` : '';
  const lines = [
    `Hi ${first(f.tenantName) || 'there'}, this confirms I received ${money(f.paidAmount)} for ${month(f.period)} rent at ${f.home}${f.paidOn ? ` on ${day(f.paidOn)}` : ''}${how}.`,
    balance > 0 ? `Balance still due for ${month(f.period)}: ${money(balance)}.` : `${month(f.period)} is paid in full. Thank you!`,
  ];
  if (url) lines.push(`Receipt: ${url}`);
  if (f.landlordName) lines.push(`- ${first(f.landlordName)}`);
  return lines.join('\n');
}

export interface ReminderFacts {
  tenantName: string;
  landlordName: string | null;
  home: string;
  period: string;
  dueDate: string;
  amount: string | number;
  paidAmount: string | number;
  late: boolean;
}

export function reminderText(f: ReminderFacts, url?: string): string {
  const owed = money(balanceOf(f));
  const lines = [
    f.late
      ? `Hi ${first(f.tenantName) || 'there'}, ${month(f.period)} rent for ${f.home} (${owed}) was due ${day(f.dueDate)} and hasn't been received yet. Please send it as soon as you can, or let me know if there's a problem.`
      : `Hi ${first(f.tenantName) || 'there'}, a friendly reminder that ${month(f.period)} rent for ${f.home} (${owed}) is due ${day(f.dueDate)}.`,
  ];
  if (url) lines.push(url);
  if (f.landlordName) lines.push(`- ${first(f.landlordName)}`);
  return lines.join('\n');
}

/** A link that opens the phone's messages app with the text filled in. */
export function smsLink(phone: string | null | undefined, body: string): string {
  const to = (phone ?? '').replace(/[^\d+]/g, '');
  // "?&body=" is understood by both iPhone and Android messaging apps.
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}
