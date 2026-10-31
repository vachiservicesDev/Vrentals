'use client';

import { useParams } from 'next/navigation';
import { useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { CheckboxField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, Loading, PageHeader, formatDate } from '@/components/ui/ui';

interface Agreement {
  id: string;
  status: 'draft' | 'sent' | 'signed' | 'void';
  terms?: { landlordName: string };
  body: string;
  bodySha256: string;
  landlordName: string | null;
  landlordSignedAt: string | null;
  tenantName: string | null;
  tenantSignedAt: string | null;
  landlordSignedIp?: string | null;
  tenantSignedIp?: string | null;
}
interface Data {
  as: 'landlord' | 'tenant';
  agreement: Agreement;
  lease: { id: string; tenantName: string; startDate: string; endDate: string | null };
  home: { id: string; name: string };
}

const STATUS: Record<Agreement['status'], { label: string; tone: 'muted' | 'warning' | 'live' | 'danger' }> = {
  draft: { label: 'Draft, not signed yet', tone: 'muted' },
  sent: { label: 'Waiting for the tenant to sign', tone: 'warning' },
  signed: { label: 'Signed by both', tone: 'live' },
  void: { label: 'Void', tone: 'danger' },
};

/** The written lease: the full text, both signatures, and signing. The landlord and the tenant see the same page. */
export default function AgreementPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useResource<Data>(`/api/agreements/${id}`);
  const action = useAction();

  if (loading && !data) return <Loading />;
  if (!data) return <Alert title="Couldn't load this lease">{error ?? 'Not found'}</Alert>;
  const { as, agreement: a, lease, home } = data;
  const back = as === 'landlord' ? { href: `/homes/${home.id}`, label: home.name } : { href: '/home', label: 'My home' };
  const mySigningTurn = (as === 'landlord' && a.status === 'draft') || (as === 'tenant' && a.status === 'sent');
  const expectedName = as === 'landlord' ? (a.terms?.landlordName ?? '') : lease.tenantName;

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const done = as === 'landlord' ? 'Signed and sent to your tenant.' : 'Signed. Your landlord has been told, and the signed lease is saved here.';
    const result = await action.run('sign', `/api/agreements/${a.id}/sign`, { body: { signedName: String(fd.get('signedName') ?? '').trim(), consent: fd.get('consent') === 'on' } }, done);
    if (result.ok) reload();
  }

  async function voidIt() {
    const warn = a.status === 'signed' ? 'Void this signed lease? It stays on record marked void, and you can prepare a new one.' : 'Void this lease? It stays on record marked void, and you can prepare a new one.';
    if (!window.confirm(warn)) return;
    const result = await action.run('void', `/api/agreements/${a.id}/void`, { method: 'POST', body: {} });
    if (result.ok) reload();
  }

  return (
    <>
      <div className="no-print">
        <PageHeader back={back} eyebrow="Written lease" title={home.name} lead={`${lease.tenantName} · ${formatDate(lease.startDate)} to ${lease.endDate ? formatDate(lease.endDate) : 'month to month'}`} actions={<Chip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Chip>} />
      </div>
      <div className="grid gap-8">
        <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ signedName: 'Signature', consent: 'Agreement to sign electronically' }} />
        {a.status === 'void' && <Alert title="This lease was voided">It&apos;s kept for the record but isn&apos;t in effect.</Alert>}
        {as === 'landlord' && a.status === 'draft' && (
          <Alert tone="info" title="Check it, then sign">
            Read the whole lease. To change something, edit the terms on the home page and prepare it again. When you sign, your tenant is asked to sign too. Have a local landlord-tenant attorney review this template before you first use it.
          </Alert>
        )}

        <article className="rounded-lg border border-line bg-white p-6 md:p-10">
          <LeaseText text={a.body} />
          <section className="mt-10 grid gap-6 border-t border-line pt-6 sm:grid-cols-2" aria-label="Signatures">
            <Signature role="Landlord" name={a.landlordName} at={a.landlordSignedAt} ip={a.landlordSignedIp} />
            <Signature role="Tenant" name={a.tenantName} at={a.tenantSignedAt} ip={a.tenantSignedIp} />
          </section>
          <p className="mt-6 break-all text-xs text-muted">Document fingerprint (SHA-256): {a.bodySha256}</p>
        </article>

        {mySigningTurn && (
          <form onSubmit={sign} noValidate className="no-print grid gap-5 rounded-lg border border-line bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-ink">Sign the lease</h2>
            <TextField name="signedName" label="Type your full name to sign" required autoComplete="name" hint={expectedName ? `As it appears in the lease: ${expectedName}.` : undefined} errors={action.fieldErrors} />
            <CheckboxField name="consent" label="I've read this lease and agree to sign it electronically. My typed name is my signature." errors={action.fieldErrors} />
            <div>
              <Button type="submit" busy={action.busy === 'sign'} busyLabel="Signing…">
                {as === 'landlord' ? 'Sign and send to tenant' : 'Sign the lease'}
              </Button>
            </div>
          </form>
        )}
        {as === 'landlord' && a.status === 'sent' && <p className="no-print text-ink-2">{lease.tenantName} can sign from their Vrentals account. If they don&apos;t have a login yet, invite them from the home page.</p>}

        <div className="no-print flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          {as === 'landlord' && a.status !== 'void' && (
            <Button variant="danger" onClick={voidIt} busy={action.busy === 'void'} busyLabel="Voiding…">
              Void this lease
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/** Renders the numbered sections: "1. TITLE" lines become headings, the rest paragraphs. */
function LeaseText({ text }: { text: string }) {
  const [title, ...lines] = text.split('\n');
  return (
    <div className="grid gap-3 text-ink-2">
      <h2 className="font-display text-center text-xl font-semibold text-ink">{title}</h2>
      {lines
        .filter((l) => l.trim() !== '')
        .map((l, i) =>
          /^\d+\. [A-Z'"\- ,]+$/.test(l) ? (
            <h3 key={i} className="mt-3 font-semibold text-ink">
              {l}
            </h3>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {l}
            </p>
          ),
        )}
    </div>
  );
}

function Signature({ role, name, at, ip }: { role: string; name: string | null; at: string | null; ip?: string | null }) {
  return (
    <div>
      <p className="t-label text-muted">{role}</p>
      {name && at ? (
        <>
          <p className="font-display mt-2 text-2xl italic text-ink">{name}</p>
          <p className="mt-1 text-sm text-muted">
            Signed electronically {formatDate(at, true)}
            {ip ? ` from ${ip}` : ''}
          </p>
        </>
      ) : (
        <p className="mt-2 border-b border-line-input pb-6 text-muted">Not signed yet</p>
      )}
    </div>
  );
}
