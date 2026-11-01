'use client';

import { useRouter } from 'next/navigation';
import { useAction } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FieldRow, SelectField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';

export function AccountForm({ fullName, phone, kind }: { fullName: string; phone: string; kind?: string }) {
  const router = useRouter();
  const action = useAction();

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await action.run('save', '/api/account', { method: 'PATCH', body: { fullName: String(fd.get('fullName') ?? ''), phone: String(fd.get('phone') ?? ''), ...(kind ? { kind: String(fd.get('kind') ?? kind) } : {}) } }, 'Saved.');
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-5">
      <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ fullName: 'Name' }} />
      <FieldRow>
        <TextField name="fullName" label="Name" required defaultValue={fullName} autoComplete="name" errors={action.fieldErrors} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={phone} autoComplete="tel" errors={action.fieldErrors} />
      </FieldRow>
      {kind && (
        <SelectField
          name="kind"
          label="I use Vrentals for"
          options={[
            { value: 'homeowner', label: 'The home I live in' },
            { value: 'landlord', label: 'Homes I rent out' },
          ]}
          defaultValue={kind}
          hint="Changes your menus and wording. You can still add both kinds of home."
          id="f-account-kind"
        />
      )}
      <div>
        <Button type="submit" busy={action.busy === 'save'} busyLabel="Saving…">
          Save
        </Button>
      </div>
    </form>
  );
}
