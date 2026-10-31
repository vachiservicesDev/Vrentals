'use client';

import { useParams } from 'next/navigation';
import { useResource } from '@/lib/client/api';
import { PAYMENT_METHODS, labelFrom } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Alert, Loading, formatMoney, formatDate } from '@/components/ui/ui';

interface Receipt {
  number: string;
  period: string;
  dueDate: string;
  rent: string;
  paid: string;
  balance: string;
  paidOn: string | null;
  paymentMethod: string | null;
  tenant: { name: string; email: string; phone: string | null };
  home: { name: string; address: string };
  landlord: { name: string | null };
}

const monthLabel = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A printable rent receipt. The landlord and the tenant see the same page. */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useResource<{ receipt: Receipt }>(`/api/receipts/${id}`);
  if (loading) return <Loading />;
  if (error || !data) return <Alert title="Couldn't load this receipt">{error ?? 'Not found'}</Alert>;
  const r = data.receipt;
  const paidInFull = Number(r.balance) === 0;

  return (
    <article className="mx-auto max-w-2xl rounded-lg border border-line bg-white p-6 md:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="t-label text-muted">Rent receipt</p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-ink">{monthLabel(r.period)}</h1>
        </div>
        <dl className="text-right text-sm">
          <dt className="text-muted">Receipt no.</dt>
          <dd className="font-semibold text-ink">{r.number}</dd>
        </dl>
      </header>

      <dl className="grid gap-x-8 gap-y-4 py-6 sm:grid-cols-2">
        <Item label="Received from" value={r.tenant.name} />
        <Item label="Received by" value={r.landlord.name ?? 'Landlord'} />
        <Item label="Property" value={<>{r.home.name}<span className="block text-muted">{r.home.address}</span></>} />
        <Item label="Payment date" value={formatDate(r.paidOn)} />
        <Item label="Paid by" value={r.paymentMethod ? labelFrom(PAYMENT_METHODS, r.paymentMethod) : '—'} />
        <Item label="Rent due" value={formatDate(r.dueDate)} />
      </dl>

      <table className="w-full border-t border-line text-left">
        <caption className="sr-only">Amounts</caption>
        <tbody>
          <Row label={`Rent for ${monthLabel(r.period)}`} value={formatMoney(r.rent)} />
          <Row label="Paid" value={formatMoney(r.paid)} strong />
          <Row label="Balance for the month" value={formatMoney(r.balance)} />
        </tbody>
      </table>

      <p className={`mt-6 rounded-md p-3 text-center font-semibold ${paidInFull ? 'bg-green-50 text-green-700' : 'bg-subtle text-ink'}`}>
        {paidInFull ? `${monthLabel(r.period)} rent is paid in full.` : `${formatMoney(r.balance)} is still due for ${monthLabel(r.period)}.`}
      </p>
      <p className="mt-6 text-sm text-muted">This receipt confirms the payment your landlord recorded in Vrentals. Keep it for your records.</p>

      <div className="no-print mt-8 flex flex-wrap gap-3">
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
        <Button variant="ghost" onClick={() => history.back()}>
          Back
        </Button>
      </div>
    </article>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="t-label text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr className="border-b border-line">
      <th scope="row" className={`py-3 font-normal ${strong ? 'font-semibold text-ink' : 'text-muted'}`}>
        {label}
      </th>
      <td className={`py-3 text-right ${strong ? 'font-display text-lg font-semibold text-ink' : 'text-ink'}`}>{value}</td>
    </tr>
  );
}
