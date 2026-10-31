'use client';

import { useState } from 'react';
import { api, useAction, useResource } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FieldRow, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, Panel, When } from '@/components/ui/ui';

interface Team {
  owner: { id: string; email: string; fullName: string | null };
  coLandlords: { id: string; email: string; fullName: string | null; createdAt: string }[];
  isOwner: boolean;
}

/** Co-landlords: people (a spouse, a partner) who manage the same homes with the same access. */
export function TeamPanel() {
  const team = useResource<Team>('/api/team');
  const action = useAction();
  const [link, setLink] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function add(mode: 'email' | 'link', form: HTMLFormElement | null) {
    if (!form) return;
    setLink(null);
    const fd = new FormData(form);
    const body = { fullName: String(fd.get('fullName') ?? ''), email: String(fd.get('email') ?? ''), mode };
    const result = await action.run<{ outcome: string; link: string | null }>(mode, '/api/team', { body });
    if (!result.ok || !result.data) return;
    if (result.data.link) {
      setLink(result.data.link);
      action.setSuccess(`${body.fullName} is added. Text them this link to set their password; it works once and expires in 24 hours.`);
    } else if (result.data.outcome === 'existing') {
      action.setSuccess(`${body.fullName} is added. ${body.email} already has a login, so they can sign in with their own password now, or use "Forgot password".`);
    } else {
      action.setSuccess(`${body.fullName} is added, and an invite is on its way to ${body.email}.`);
    }
    form.reset();
    team.reload();
  }

  async function remove(id: string, who: string) {
    if (!window.confirm(`Remove ${who}? They'll no longer see your homes in Vrentals.`)) return;
    setRowError(null);
    const result = await api(`/api/team/${id}`, { method: 'DELETE' });
    if (!result.ok) setRowError(result.message);
    else team.reload();
  }

  const data = team.data;
  return (
    <Panel
      title="Co-landlords"
      description="People who manage these homes with you, like a spouse or business partner. They see and change everything you can: rent, repairs, money, documents and reports."
    >
      <div className="grid gap-6">
        {team.error && <Alert>{team.error}</Alert>}
        {rowError && <Alert>{rowError}</Alert>}
        {data && (
          <DataTable
            caption="Who manages these homes"
            rows={[{ id: data.owner.id, email: data.owner.email, fullName: data.owner.fullName, createdAt: '', owner: true }, ...data.coLandlords.map((c) => ({ ...c, owner: false }))]}
            rowKey={(r) => r.id}
            columns={[
              { header: 'Name', primary: true, cell: (r) => r.fullName || r.email },
              { header: 'Email', cell: (r) => r.email },
              { header: 'Role', cell: (r) => <Chip tone={r.owner ? 'live' : 'info'}>{r.owner ? 'Owner' : 'Co-landlord'}</Chip> },
              { header: 'Added', cell: (r) => (r.owner ? '—' : <When iso={r.createdAt} />) },
              {
                header: 'Actions',
                align: 'right',
                cell: (r) =>
                  data.isOwner && !r.owner ? (
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id, r.fullName || r.email)}>
                      Remove
                    </Button>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
        {data?.isOwner ? (
          <form onSubmit={(e) => e.preventDefault()} noValidate className="grid gap-5 border-t border-line pt-6">
            <h3 className="font-display text-lg font-semibold text-ink">Add a co-landlord</h3>
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ fullName: 'Name', email: 'Email' }} />
            {link && (
              <div className="grid gap-2">
                <label htmlFor="team-link" className="font-medium text-ink">
                  Sign-in link
                </label>
                <input id="team-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-h-11 w-full rounded-md border border-line-input bg-subtle px-3 font-mono text-sm text-ink" />
              </div>
            )}
            <FieldRow>
              <TextField name="fullName" label="Name" required autoComplete="off" errors={action.fieldErrors} />
              <TextField name="email" label="Email" type="email" required autoComplete="off" errors={action.fieldErrors} />
            </FieldRow>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={(e) => add('link', e.currentTarget.form)} busy={action.busy === 'link'} busyLabel="Adding…">
                Add and create invite link
              </Button>
              <Button variant="ghost" onClick={(e) => add('email', e.currentTarget.form)} busy={action.busy === 'email'} busyLabel="Sending…">
                Add and email invite
              </Button>
            </div>
          </form>
        ) : data ? (
          <p className="text-sm text-muted">Only {data.owner.fullName || data.owner.email}, the owner, can add or remove co-landlords.</p>
        ) : null}
      </div>
    </Panel>
  );
}
