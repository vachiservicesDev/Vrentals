'use client';

import { useState } from 'react';
import { api, useAction, useResource } from '@/lib/client/api';
import { createClient } from '@/lib/supabase/client';
import { DOCUMENT_KINDS, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/rentals/documents';
import { Button } from '@/components/ui/Button';
import { FieldHelp, FieldLabel, FieldRow, SelectField, TextField, borderClass, inputClass } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Chip, DataTable, EmptyState, Panel, When } from '@/components/ui/ui';

interface Doc {
  id: string;
  kind: string;
  name: string;
  fileName: string;
  size: number;
  expiresOn: string | null;
  notes: string | null;
  createdAt: string;
}

const EXT_TYPES: Record<string, string> = { heic: 'image/heic', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain' };
const kindLabel = (v: string) => DOCUMENT_KINDS.find((k) => k.value === v)?.label ?? v;
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** A home's private papers. Only the landlord and co-landlords can list or open them; tenants have no way in. */
export function DocumentsPanel({ propertyId }: { propertyId: string }) {
  const list = useResource<{ documents: Doc[] }>(`/api/properties/${propertyId}/documents`);
  const action = useAction();
  const [rowError, setRowError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get('file');
    setFileError(null);
    action.clear();
    if (!(file instanceof File) || file.size === 0) return setFileError('Choose a file.');
    const contentType = file.type || EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
    if (!(DOCUMENT_TYPES as readonly string[]).includes(contentType)) return setFileError('Upload a PDF, photo, Word, Excel or text file.');
    if (file.size > MAX_DOCUMENT_BYTES) return setFileError('Files can be up to 25 MB.');

    const meta = { fileName: file.name, contentType, size: file.size };
    const ticket = await action.run<{ path: string; token: string }>('upload', `/api/properties/${propertyId}/documents/upload`, { body: meta });
    if (!ticket.ok || !ticket.data) return;
    // The file goes straight to private Storage with a one-time token; it never passes through our server.
    const sent = await createClient().storage.from('rentals-documents').uploadToSignedUrl(ticket.data.path, ticket.data.token, file, { contentType });
    if (sent.error) return action.setError(`The upload didn't finish: ${sent.error.message}`);

    const body = {
      ...meta,
      path: ticket.data.path,
      kind: String(fd.get('kind') ?? ''),
      name: String(fd.get('name') ?? '').trim() || file.name.replace(/\.[^.]+$/, ''),
      expiresOn: String(fd.get('expiresOn') ?? ''),
      notes: String(fd.get('notes') ?? ''),
    };
    const saved = await action.run('upload', `/api/properties/${propertyId}/documents`, { body }, 'Saved.');
    if (saved.ok) {
      form.reset();
      list.reload();
    }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Delete "${d.name}"? The file is removed for good.`)) return;
    setRowError(null);
    const result = await api(`/api/documents/${d.id}`, { method: 'DELETE' });
    if (!result.ok) setRowError(result.message);
    else list.reload();
  }

  const rows = list.data?.documents ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel
      id="documents"
      title="Documents"
      description="Insurance policies, HOA and tax bills, closing papers and other records for this home. Private to you and your co-landlords; tenants never see them."
    >
      <div className="grid gap-6">
        {list.error && <Alert>{list.error}</Alert>}
        {rowError && <Alert>{rowError}</Alert>}
        {rows.length === 0 ? (
          <EmptyState>No documents yet.</EmptyState>
        ) : (
          <DataTable
            caption="Documents for this home"
            rows={rows}
            rowKey={(d) => d.id}
            columns={[
              {
                header: 'Document',
                primary: true,
                cell: (d) => (
                  <span>
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" className="link">
                      {d.name}
                    </a>
                    <span className="block text-sm font-normal text-muted">{[d.fileName, sizeLabel(d.size), d.notes].filter(Boolean).join(' · ')}</span>
                  </span>
                ),
              },
              { header: 'Kind', cell: (d) => kindLabel(d.kind) },
              {
                header: 'Expires',
                cell: (d) =>
                  d.expiresOn ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <When iso={d.expiresOn} />
                      {d.expiresOn < today && <Chip tone="danger">Expired</Chip>}
                    </span>
                  ) : (
                    '—'
                  ),
              },
              { header: 'Added', cell: (d) => <When iso={d.createdAt} /> },
              {
                header: 'Actions',
                align: 'right',
                cell: (d) => (
                  <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                    Delete
                  </Button>
                ),
              },
            ]}
          />
        )}
        <details className="rounded-lg border border-line" open={rows.length === 0}>
          <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-brand-700">Upload a document</summary>
          <form onSubmit={upload} noValidate className="grid gap-5 border-t border-line p-4">
            <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ kind: 'Kind', name: 'Name' }} />
            <div>
              <FieldLabel htmlFor="f-doc-file" label="File" required />
              <input
                id="f-doc-file"
                name="file"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
                aria-invalid={!!fileError}
                aria-describedby={fileError ? 'f-doc-file-hint f-doc-file-error' : 'f-doc-file-hint'}
                className={`mt-1.5 ${inputClass} ${borderClass(!!fileError)} file:mr-3 file:rounded file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:font-medium`}
              />
              <FieldHelp name="f-doc-file" hint="PDF, photo, Word, Excel or text, up to 25 MB." error={fileError ?? undefined} />
            </div>
            <FieldRow cols={3}>
              <SelectField name="kind" label="Kind" required placeholder="Choose one" options={[...DOCUMENT_KINDS]} errors={action.fieldErrors} id="f-doc-kind" />
              <TextField name="name" label="Name" hint="Like “2026 homeowners policy”. Blank uses the file name." errors={action.fieldErrors} id="f-doc-name" />
              <TextField name="expiresOn" label="Expires or renews" type="date" hint="For a policy or permit." errors={action.fieldErrors} id="f-doc-expires" />
            </FieldRow>
            <TextField name="notes" label="Note" hint="Policy number, agent, anything useful." errors={action.fieldErrors} id="f-doc-notes" />
            <div>
              <Button type="submit" busy={action.busy === 'upload'} busyLabel="Uploading…">
                Upload
              </Button>
            </div>
          </form>
        </details>
      </div>
    </Panel>
  );
}
