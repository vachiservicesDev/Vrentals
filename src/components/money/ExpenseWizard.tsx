'use client';

import { useState } from 'react';
import { formValues, useAction } from '@/lib/client/api';
import { checkFile, uploadHomeDocument } from '@/lib/client/upload';
import { PAID_FROM, type TransactionType } from '@/lib/rentals/money';
import { catalog } from '@/components/money/MoneyPanel';
import { StepForm } from '@/components/ui/StepForm';
import { FieldHelp, FieldRow, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';

export interface ExpenseHome {
  id: string;
  name: string;
  use: string;
}

/**
 * Add a bill or expense in three short steps: what and how much, when and to whom, then a photo
 * or PDF of the bill. The receipt is optional and is saved with the home's documents, linked to
 * this expense.
 */
export function ExpenseWizard({ homes, onSaved }: { homes: ExpenseHome[]; onSaved: (message: string) => void }) {
  const action = useAction();
  const [homeId, setHomeId] = useState(homes[0]?.id ?? '');
  const home = homes.find((h) => h.id === homeId) ?? homes[0];
  const own = home?.use === 'own';
  const cat = catalog(own);
  const [type, setType] = useState<TransactionType>('expense');
  const [category, setCategory] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const hint = cat.categoryOf(type, category)?.hint;

  async function save(form: HTMLFormElement) {
    if (!home) return;
    const file = (form.elements.namedItem('receipt') as HTMLInputElement | null)?.files?.[0];
    if (file) {
      const checked = checkFile(file);
      if ('problem' in checked) return setFileError(checked.problem);
    }
    const { receipt: _file, homeId: _home, ...values } = formValues(form);
    const result = await action.run<{ transaction: { id: string } }>('save', `/api/properties/${home.id}/transactions`, { body: values });
    if (!result.ok || !result.data) return;
    if (file) {
      const problem = await uploadHomeDocument(home.id, file, { kind: 'receipt', name: `${values.payee || cat.categoryOf(type, category)?.label || 'Receipt'} ${values.date ?? ''}`.trim(), transactionId: result.data.transaction.id });
      if (problem) {
        onSaved(`Expense saved, but the receipt didn't upload: ${problem} You can upload it from the list.`);
        return;
      }
    }
    onSaved(file ? 'Expense and receipt saved.' : 'Expense saved.');
  }

  const kinds = cat.types.filter((t) => t.value === 'expense' || t.value === 'capital');
  return (
    <StepForm
      onSubmit={save}
      submitLabel="Save expense"
      busy={action.busy === 'save'}
      fieldErrors={action.fieldErrors}
      status={<FormStatus error={action.error} fieldErrors={action.fieldErrors} labels={{ category: 'Type', amount: 'Amount', date: 'Date paid' }} />}
      steps={[
        {
          title: 'What and how much',
          hint: 'Pick the home, what you paid for, and the amount.',
          content: (
            <>
              {homes.length > 1 && (
                <SelectField
                  name="homeId"
                  label="Which home"
                  required
                  options={homes.map((h) => ({ value: h.id, label: h.use === 'own' ? `${h.name} (you live here)` : h.name }))}
                  value={homeId}
                  onChange={(e) => {
                    setHomeId(e.target.value);
                    setCategory('');
                  }}
                />
              )}
              <FieldRow>
                <SelectField
                  name="type"
                  label="Kind"
                  required
                  options={kinds}
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as TransactionType);
                    setCategory('');
                  }}
                />
                <SelectField name="category" label="Type" required placeholder="Choose one" options={cat.options(type)} value={category} onChange={(e) => setCategory(e.target.value)} hint={hint} errors={action.fieldErrors} />
              </FieldRow>
              <TextField name="amount" label="Amount ($)" type="number" inputMode="decimal" min={0.01} step="0.01" required placeholder="0.00" errors={action.fieldErrors} />
            </>
          ),
        },
        {
          title: 'When and to whom',
          hint: 'The day you paid, and who you paid.',
          content: (
            <>
              <FieldRow>
                <TextField name="date" label="Date paid" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} errors={action.fieldErrors} />
                <TextField name="payee" label="Paid to" hint={own ? 'Your lender, the town, the contractor.' : 'The company or person, as on the bill.'} errors={action.fieldErrors} />
              </FieldRow>
              {!own && <SelectField name="paidFrom" label="Paid from" options={[...PAID_FROM]} defaultValue="business" hint="If you paid with your own card, choose personal so it shows as owed back to you." />}
              <TextAreaField name="description" label="Note" rows={2} hint="What it was for, in a few words." errors={action.fieldErrors} />
            </>
          ),
        },
        {
          title: 'Bill or receipt',
          hint: 'Add a photo or PDF of the bill. You can skip this and add it later.',
          content: (
            <div>
              <label
                htmlFor="f-receipt"
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong bg-subtle px-4 py-6 text-center hover:border-brand-600"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 text-brand-700" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4" />
                </svg>
                <span className="font-semibold text-ink">{fileName || 'Choose a photo or PDF'}</span>
                <span className="text-sm text-muted">{fileName ? 'Tap to choose a different file' : 'On a phone you can take a picture of the bill.'}</span>
              </label>
              <input
                id="f-receipt"
                name="receipt"
                type="file"
                accept="image/*,.pdf,.heic"
                className="sr-only"
                aria-describedby={fileError ? 'f-receipt-error' : undefined}
                onChange={(e) => {
                  setFileError(null);
                  setFileName(e.target.files?.[0]?.name ?? '');
                }}
              />
              <FieldHelp name="f-receipt" error={fileError ?? undefined} />
            </div>
          ),
        },
      ]}
    />
  );
}

/** Uploads a receipt for an expense that's already saved. */
export async function attachReceipt(propertyId: string, transactionId: string, file: File, name: string): Promise<string | null> {
  return uploadHomeDocument(propertyId, file, { kind: 'receipt', name, transactionId });
}
