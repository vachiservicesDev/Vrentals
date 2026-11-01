'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAction, useResource } from '@/lib/client/api';
import { licenseStatus, planLabel, type LicenseStatus } from '@/lib/rentals/plans';
import { Button } from '@/components/ui/Button';
import { CheckboxField, FieldRow, SelectField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Prices } from './Prices';
import { Alert, Chip, DataTable, EmptyState, Loading, Panel, When, type Tone } from '@/components/ui/ui';

interface Landlord {
  id: string;
  email: string;
  fullName: string | null;
  kind: string;
  homeLimit: number | null;
  planExpires: string | null;
  planPaid: boolean;
  isActive: boolean;
  createdAt: string;
  homes: number;
  coLandlords: number;
}

interface Invite {
  id: string;
  token: string;
  email: string | null;
  kind: string;
  homeLimit: number | null;
  planExpires: string | null;
  paid: boolean;
  note: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  usedByEmail: string | null;
}

const STATUS: Record<LicenseStatus, [Tone, string]> = {
  suspended: ['danger', 'Suspended'],
  expired: ['warning', 'Expired, read-only'],
  paid: ['live', 'Paid'],
  trial: ['info', 'Unpaid, has end date'],
  free: ['muted', 'Unpaid, no end date'],
};

type SortKey = 'newest' | 'oldest' | 'name' | 'ends' | 'homes';
const SORTS: Record<SortKey, { label: string; compare: (a: Landlord, b: Landlord) => number }> = {
  newest: { label: 'Newest first', compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  oldest: { label: 'Oldest first', compare: (a, b) => a.createdAt.localeCompare(b.createdAt) },
  name: { label: 'Name, A to Z', compare: (a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email) },
  ends: { label: 'License ends soonest', compare: (a, b) => (a.planExpires ?? '9999').localeCompare(b.planExpires ?? '9999') },
  homes: { label: 'Most homes', compare: (a, b) => b.homes - a.homes },
};

const KINDS = [
  { value: 'landlord', label: 'Landlord' },
  { value: 'homeowner', label: 'Homeowner' },
];

const inviteLink = (token: string) => `${typeof window === 'undefined' ? '' : window.location.origin}/signup?invite=${encodeURIComponent(token)}`;

export function LandlordPlans({ selfId }: { selfId: string }) {
  const { data, error, loading, reload } = useResource<{ landlords: Landlord[] }>('/api/platform/landlords');
  const invites = useResource<{ invites: Invite[] }>('/api/platform/invites');
  const [editing, setEditing] = useState<Landlord | null>(null);
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<'' | LicenseStatus>('');
  const [kind, setKind] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = (data?.landlords ?? []).filter(
      (l) =>
        (!term || `${l.fullName ?? ''} ${l.email}`.toLowerCase().includes(term)) &&
        (!status || licenseStatus(l) === status) &&
        (!kind || l.kind === kind),
    );
    return [...rows].sort(SORTS[sort].compare);
  }, [data, term, status, kind, sort]);
  const shownInvites = useMemo(
    () => (invites.data?.invites ?? []).filter((i) => !term || `${i.email ?? ''} ${i.note ?? ''} ${i.usedByEmail ?? ''}`.toLowerCase().includes(term)),
    [invites.data, term],
  );
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error ?? 'Not found'}</Alert>;
  const filtered = !!(term || status || kind);

  return (
    <div className="grid gap-8">
      <InviteForm onCreated={invites.reload} />
      <InviteList invites={shownInvites} loading={invites.loading} onChange={invites.reload} />
      <Prices />

      {editing && (
        <PlanForm
          key={editing.id}
          landlord={editing}
          onDone={() => {
            setEditing(null);
            reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <Panel
        title="Accounts and licenses"
        description={filtered ? `${shown.length} of ${data.landlords.length} accounts` : `${data.landlords.length} ${data.landlords.length === 1 ? 'account' : 'accounts'}`}
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm font-semibold text-ink sm:col-span-2 lg:col-span-1">
            Search
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or email"
              className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as '' | LicenseStatus)} className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal">
              <option value="">All</option>
              {(Object.keys(STATUS) as LicenseStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS[k][1]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal">
              <option value="">All</option>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-ink">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="min-h-11 rounded-[10px] border border-line-strong bg-white px-3 font-normal">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filtered && (
          <p className="mb-4">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setQ('');
                setStatus('');
                setKind('');
              }}
            >
              Clear filters
            </Button>
          </p>
        )}
        {shown.length === 0 ? (
          <EmptyState>{data.landlords.length === 0 ? 'No accounts yet. Send an invitation link above.' : 'No accounts match.'}</EmptyState>
        ) : (
          <DataTable
            caption="Accounts and their licenses"
            rows={shown}
            rowKey={(l) => l.id}
            columns={[
              { header: 'Account', primary: true, cell: (l) => <span>{l.fullName || l.email}<span className="block text-sm font-normal text-muted">{l.email}{l.coLandlords ? ` · ${l.coLandlords} co-landlord${l.coLandlords > 1 ? 's' : ''}` : ''}</span></span> },
              { header: 'Type', cell: (l) => (l.kind === 'homeowner' ? 'Homeowner' : 'Landlord') },
              { header: 'Homes', cell: (l) => (l.homeLimit === null ? `${l.homes} (no limit)` : `${l.homes} of ${l.homeLimit}`) },
              { header: 'License', cell: (l) => planLabel(l) },
              {
                header: 'Status',
                cell: (l) => {
                  const [tone, label] = STATUS[licenseStatus(l)];
                  return <Chip tone={tone}>{label}</Chip>;
                },
              },
              { header: 'Joined', cell: (l) => <When iso={l.createdAt} /> },
              {
                header: 'Actions',
                align: 'right',
                cell: (l) =>
                  l.id === selfId ? (
                    <span className="text-sm text-muted">You</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(l)}>
                      Change license
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(inviteLink(token));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt('Copy this link', inviteLink(token));
        }
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function InviteForm({ onCreated }: { onCreated: () => void }) {
  const action = useAction();
  const [created, setCreated] = useState<Invite | null>(null);
  const [formKey, setFormKey] = useState(0);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      email: String(fd.get('email') ?? '').trim(),
      kind: String(fd.get('kind') ?? 'landlord'),
      homeLimit: String(fd.get('homeLimit') ?? '').trim(),
      planExpires: String(fd.get('planExpires') ?? ''),
      paid: fd.get('paid') === 'on',
      note: String(fd.get('note') ?? '').trim(),
    };
    const result = await action.run<{ invite: Invite }>('invite', '/api/platform/invites', { body });
    if (result.ok && result.data) {
      setCreated(result.data.invite);
      setFormKey((k) => k + 1);
      onCreated();
    }
  }
  return (
    <Panel title="Invite someone" description="Nobody can sign up without an invitation link. The link gives the new account the license you set here. Each link works once.">
      {created && (
        <div role="status" className="mb-5 grid gap-3 rounded-lg border border-green-700/20 bg-green-50 p-4">
          <p className="font-semibold text-ink">Invitation link ready{created.email ? ` for ${created.email}` : ''}. Send it to them by text or email.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md bg-white px-3 py-2 text-sm text-ink ring-1 ring-line">{inviteLink(created.token)}</code>
            <CopyLink token={created.token} />
          </div>
        </div>
      )}
      <form key={formKey} onSubmit={save} noValidate className="grid gap-5">
        <FormStatus error={action.error} fieldErrors={action.fieldErrors} labels={{ email: 'Email', homeLimit: 'Homes allowed', planExpires: 'License ends' }} />
        <FieldRow>
          <TextField name="email" label="Their email" type="email" inputMode="email" hint="Optional. If you fill it in, only this email can use the link." errors={action.fieldErrors} />
          <SelectField name="kind" label="Account type" options={KINDS} defaultValue="landlord" />
        </FieldRow>
        <FieldRow cols={3}>
          <TextField name="homeLimit" label="Homes allowed" type="number" min={0} hint="Blank for no limit." errors={action.fieldErrors} />
          <TextField name="planExpires" label="License ends" type="date" hint="Blank for no end date." errors={action.fieldErrors} />
          <div className="sm:pt-8">
            <CheckboxField name="paid" label="Paid" hint="Leave unticked for a free trial." />
          </div>
        </FieldRow>
        <TextField name="note" label="Note for you" hint="For example: trial landlord from the meetup." errors={action.fieldErrors} />
        <div>
          <Button type="submit" busy={action.busy === 'invite'} busyLabel="Making link…">
            Make invitation link
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function InviteList({ invites, loading, onChange }: { invites: Invite[]; loading: boolean; onChange: () => void }) {
  const action = useAction();
  if (loading) return <Loading />;
  if (invites.length === 0) return null;
  return (
    <Panel title="Invitation links" description="Waiting links can be copied again or cancelled.">
      {action.error && <Alert>{action.error}</Alert>}
      <DataTable
        caption="Invitation links"
        rows={invites}
        rowKey={(i) => i.id}
        columns={[
          { header: 'For', primary: true, cell: (i) => <span>{i.email || 'Anyone with the link'}{i.note && <span className="block text-sm font-normal text-muted">{i.note}</span>}</span> },
          { header: 'Type', cell: (i) => (i.kind === 'homeowner' ? 'Homeowner' : 'Landlord') },
          { header: 'License', cell: (i) => `${planLabel(i)}${i.paid ? ', paid' : ', unpaid'}` },
          {
            header: 'Status',
            cell: (i) =>
              i.usedAt ? <Chip tone="live">Signed up{i.usedByEmail ? `: ${i.usedByEmail}` : ''}</Chip> : i.revokedAt ? <Chip tone="muted">Cancelled</Chip> : <Chip tone="new">Waiting</Chip>,
          },
          { header: 'Made', cell: (i) => <When iso={i.createdAt} /> },
          {
            header: 'Actions',
            align: 'right',
            cell: (i) =>
              i.usedAt || i.revokedAt ? null : (
                <span className="flex flex-wrap justify-end gap-2">
                  <CopyLink token={i.token} />
                  <Button
                    size="sm"
                    variant="ghost"
                    busy={action.busy === i.id}
                    busyLabel="Cancelling…"
                    onClick={async () => {
                      if (!window.confirm('Cancel this invitation link? Nobody will be able to sign up with it.')) return;
                      const result = await action.run(i.id, `/api/platform/invites/${i.id}`, { method: 'DELETE' });
                      if (result.ok) onChange();
                    }}
                  >
                    Cancel link
                  </Button>
                </span>
              ),
          },
        ]}
      />
    </Panel>
  );
}

function PlanForm({ landlord: l, onDone, onCancel }: { landlord: Landlord; onDone: () => void; onCancel: () => void }) {
  const action = useAction();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { homeLimit: String(fd.get('homeLimit') ?? '').trim(), planExpires: String(fd.get('planExpires') ?? ''), planPaid: fd.get('planPaid') === 'on', isActive: fd.get('isActive') === 'yes' };
    const result = await action.run('save', `/api/platform/landlords/${l.id}`, { method: 'PATCH', body });
    if (result.ok) onDone();
  }
  return (
    <Panel title={`License for ${l.fullName || l.email}`}>
      <form onSubmit={save} noValidate className="grid gap-5">
        <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ homeLimit: 'Homes allowed', planExpires: 'License ends' }} />
        <FieldRow>
          <TextField name="homeLimit" id="plan-homeLimit" label="Homes allowed" type="number" min={0} defaultValue={l.homeLimit ?? ''} hint="Blank for no limit." errors={action.fieldErrors} />
          <TextField name="planExpires" id="plan-planExpires" label="License ends" type="date" defaultValue={l.planExpires ?? ''} hint="Blank for no end date. After it, the account is read-only." errors={action.fieldErrors} />
        </FieldRow>
        <FieldRow>
          <SelectField name="isActive" id="plan-isActive" label="Account" options={[{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Suspended (cannot sign in)' }]} defaultValue={l.isActive ? 'yes' : 'no'} />
          <div className="sm:pt-8">
            <CheckboxField name="planPaid" id="plan-planPaid" label="Paid" defaultChecked={l.planPaid} />
          </div>
        </FieldRow>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
            Save license
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
