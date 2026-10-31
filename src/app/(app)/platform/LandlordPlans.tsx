'use client';

import { useState } from 'react';
import { useAction, useResource } from '@/lib/client/api';
import { planLabel, planLapsed } from '@/lib/rentals/plans';
import { Button } from '@/components/ui/Button';
import { FieldRow, SelectField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, EmptyState, Loading, Panel, When } from '@/components/ui/ui';

interface Landlord {
  id: string;
  email: string;
  fullName: string | null;
  homeLimit: number | null;
  planExpires: string | null;
  isActive: boolean;
  createdAt: string;
  homes: number;
  coLandlords: number;
}

export function LandlordPlans({ selfId }: { selfId: string }) {
  const { data, error, loading, reload } = useResource<{ landlords: Landlord[] }>('/api/platform/landlords');
  const [editing, setEditing] = useState<Landlord | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error ?? 'Not found'}</Alert>;

  return (
    <div className="grid gap-8">
      <Panel title="Landlords" description={`${data.landlords.length} accounts`}>
        {data.landlords.length === 0 ? (
          <EmptyState>No landlords yet.</EmptyState>
        ) : (
          <DataTable
            caption="Landlords and their plans"
            rows={data.landlords}
            rowKey={(l) => l.id}
            columns={[
              { header: 'Landlord', primary: true, cell: (l) => <span>{l.fullName || l.email}<span className="block text-sm font-normal text-muted">{l.email}{l.coLandlords ? ` · ${l.coLandlords} co-landlord${l.coLandlords > 1 ? 's' : ''}` : ''}</span></span> },
              { header: 'Homes', cell: (l) => (l.homeLimit === null ? `${l.homes} (no limit)` : `${l.homes} of ${l.homeLimit}`) },
              { header: 'Plan', cell: (l) => planLabel(l) },
              {
                header: 'Status',
                cell: (l) => (!l.isActive ? <Chip tone="danger">Suspended</Chip> : planLapsed(l) ? <Chip tone="warning">Ended, read-only</Chip> : <Chip tone="live">Active</Chip>),
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
                      Change plan
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </Panel>
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
    </div>
  );
}

function PlanForm({ landlord: l, onDone, onCancel }: { landlord: Landlord; onDone: () => void; onCancel: () => void }) {
  const action = useAction();
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { homeLimit: String(fd.get('homeLimit') ?? '').trim(), planExpires: String(fd.get('planExpires') ?? ''), isActive: fd.get('isActive') === 'yes' };
    const result = await action.run('save', `/api/platform/landlords/${l.id}`, { method: 'PATCH', body });
    if (result.ok) onDone();
  }
  return (
    <Panel title={`Plan for ${l.fullName || l.email}`}>
      <form onSubmit={save} noValidate className="grid gap-5">
        <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ homeLimit: 'Homes allowed', planExpires: 'Plan ends' }} />
        <FieldRow cols={3}>
          <TextField name="homeLimit" label="Homes allowed" type="number" min={0} defaultValue={l.homeLimit ?? ''} hint="Blank for no limit." errors={action.fieldErrors} />
          <TextField name="planExpires" label="Plan ends" type="date" defaultValue={l.planExpires ?? ''} hint="Blank for no end date." errors={action.fieldErrors} />
          <SelectField name="isActive" label="Account" options={[{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Suspended (cannot sign in)' }]} defaultValue={l.isActive ? 'yes' : 'no'} />
        </FieldRow>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
            Save plan
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
