'use client';

import { useState } from 'react';
import { useAction } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { CheckboxField, FieldRow, Fieldset, SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, Panel } from '@/components/ui/ui';

const LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  currentAddress: 'Current address',
  monthlyIncome: 'Monthly income',
  adults: 'Adults',
  evictionHistory: 'Eviction history',
  certify: 'Certification',
  signedName: 'Signature',
};

/**
 * The application. It asks only what a landlord may lawfully weigh, and nothing about race, religion,
 * national origin, sex, disability, familial status, age or other protected traits. No SSN or birth
 * date: a screening company collects those itself when credit checks are added.
 */
export function ApplicationForm({ listingId, landlordName }: { listingId: string; landlordName: string | null }) {
  const action = useAction();
  const [sent, setSent] = useState(false);
  const [eviction, setEviction] = useState('no');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    fd.forEach((v, k) => {
      if (typeof v === 'string' && v.trim() !== '') body[k] = v.trim();
    });
    body.certify = fd.get('certify') === 'on';
    const result = await action.run('apply', `/api/public/listings/${listingId}/apply`, { body });
    if (result.ok) {
      setSent(true);
      window.scrollTo(0, 0);
    }
  }

  if (sent)
    return (
      <Alert tone="success" title="Application sent">
        Thank you. {landlordName || 'The landlord'} will review it and contact you by email or phone.
      </Alert>
    );

  const errors = action.fieldErrors;
  return (
    <Panel>
      <form onSubmit={submit} noValidate className="grid gap-10">
        <FormStatus error={action.error} success={action.success} fieldErrors={errors} labels={LABELS} />
        <Fieldset legend="About you">
          <FieldRow cols={3}>
            <TextField name="fullName" label="Full name" required autoComplete="name" errors={errors} />
            <TextField name="email" label="Email" type="email" required autoComplete="email" errors={errors} />
            <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" errors={errors} />
          </FieldRow>
          <FieldRow cols={3}>
            <TextField name="moveInDate" label="Hoped-for move-in date" type="date" errors={errors} />
            <TextField name="adults" label="Adults who will live here" type="number" min={1} required defaultValue="1" errors={errors} />
            <TextField name="children" label="Children who will live here" type="number" min={0} defaultValue="0" errors={errors} />
          </FieldRow>
        </Fieldset>

        <Fieldset legend="Where you live now">
          <TextField name="currentAddress" label="Current address" required autoComplete="street-address" errors={errors} />
          <FieldRow cols={3}>
            <TextField name="currentSince" label="Living there since" hint="Month and year is fine." errors={errors} />
            <TextField name="currentRent" label="Current rent ($)" type="number" min={0} step="0.01" errors={errors} />
            <TextField name="reasonForMoving" label="Why you're moving" errors={errors} />
          </FieldRow>
          <FieldRow>
            <TextField name="currentLandlordName" label="Current landlord's name" errors={errors} />
            <TextField name="currentLandlordPhone" label="Current landlord's phone" type="tel" errors={errors} />
          </FieldRow>
          <TextField name="previousAddress" label="Previous address" hint="If you've lived at your current address under two years." errors={errors} />
        </Fieldset>

        <Fieldset legend="Work and income">
          <FieldRow cols={3}>
            <TextField name="employer" label="Employer" autoComplete="organization" errors={errors} />
            <TextField name="jobTitle" label="Job title" errors={errors} />
            <TextField name="employedSince" label="Working there since" errors={errors} />
          </FieldRow>
          <FieldRow>
            <TextField
              name="monthlyIncome"
              label="Total monthly household income ($)"
              type="number"
              min={0}
              step="0.01"
              required
              hint="From all sources: wages, benefits, housing assistance, support and so on."
              errors={errors}
            />
            <TextField name="incomeNotes" label="Anything to add about income" hint="For example, a housing voucher or a new job starting." errors={errors} />
          </FieldRow>
        </Fieldset>

        <Fieldset legend="Household and references">
          <FieldRow>
            <TextField name="pets" label="Pets" hint="Kind, breed and weight. Assistance animals aren't pets; you don't need to list them." errors={errors} />
            <TextField name="vehicles" label="Vehicles" hint="How many, and make and model." errors={errors} />
          </FieldRow>
          <FieldRow>
            <TextField name="referenceName" label="A personal or work reference" errors={errors} />
            <TextField name="referencePhone" label="Their phone" type="tel" errors={errors} />
          </FieldRow>
          <FieldRow>
            <SelectField
              name="evictionHistory"
              label="Have you been evicted in the last 7 years?"
              required
              options={[
                { value: 'no', label: 'No' },
                { value: 'yes', label: 'Yes' },
              ]}
              value={eviction}
              onChange={(e) => setEviction(e.target.value)}
              errors={errors}
            />
            {eviction === 'yes' ? <TextField name="evictionDetails" label="What happened" errors={errors} /> : <div />}
          </FieldRow>
          <TextAreaField name="additionalInfo" label="Anything else you'd like the landlord to know" rows={3} errors={errors} />
        </Fieldset>

        <Fieldset legend="Sign">
          <p className="text-sm text-muted">
            A credit and background check may be requested later through a screening company, with your separate permission. Don&apos;t enter your Social Security number here.
          </p>
          <CheckboxField name="certify" label="My answers are true and complete, and the landlord may contact my references and landlords." errors={errors} />
          <TextField name="signedName" label="Type your full name to sign" required autoComplete="name" errors={errors} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <div>
            <Button type="submit" busy={action.busy === 'apply'} busyLabel="Sending…">
              Send application
            </Button>
          </div>
        </Fieldset>
      </form>
    </Panel>
  );
}
