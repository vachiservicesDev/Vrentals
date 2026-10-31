'use client';

import { useState } from 'react';
import { useAction } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { FieldRow, TextAreaField, TextField } from '@/components/ui/fields';
import { FormStatus } from '@/components/ui/forms';
import { Alert, EmptyState } from '@/components/ui/ui';

interface Slot {
  id: string;
  startsAt: string;
  minutes: number;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function BookShowing({ listingId, slots }: { listingId: string; slots: Slot[] }) {
  const action = useAction();
  const [chosen, setChosen] = useState<string>('');
  const [booked, setBooked] = useState<Slot | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const open = slots.filter((s) => !taken.has(s.id));

  if (booked)
    return (
      <Alert tone="success" title="You're booked">
        See you {dayOf(booked.startsAt)} at {timeOf(booked.startsAt)}. The landlord has your details and will contact you if anything changes.
      </Alert>
    );
  if (open.length === 0) return <EmptyState>No showing times are open right now. Check back soon, or apply and the landlord will reach out.</EmptyState>;

  const days = [...new Set(open.map((s) => dayOf(s.startsAt)))];
  async function book(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const result = await action.run('book', `/api/public/listings/${listingId}/book`, { body: { ...body, slotId: chosen } });
    if (result.ok) setBooked(open.find((s) => s.id === chosen) ?? null);
    else if (result.status === 409) {
      setTaken(new Set([...taken, chosen]));
      setChosen('');
    }
  }

  return (
    <form onSubmit={book} noValidate className="grid gap-6">
      <FormStatus error={action.error} success={action.success} fieldErrors={action.fieldErrors} labels={{ slotId: 'Time', name: 'Name', email: 'Email', phone: 'Phone' }} />
      <fieldset className="grid gap-4">
        <legend className="mb-2 font-medium text-ink">Pick a time</legend>
        {days.map((d) => (
          <div key={d}>
            <p className="t-label mb-2 text-muted">{d}</p>
            <div className="flex flex-wrap gap-2">
              {open
                .filter((s) => dayOf(s.startsAt) === d)
                .map((s) => (
                  <label key={s.id} className={`inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 font-medium ${chosen === s.id ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-line-input bg-white text-ink'}`}>
                    <input type="radio" name="slot" value={s.id} checked={chosen === s.id} onChange={() => setChosen(s.id)} className="sr-only" />
                    {timeOf(s.startsAt)}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </fieldset>
      {chosen && (
        <>
          <FieldRow cols={3}>
            <TextField name="name" label="Your name" required autoComplete="name" errors={action.fieldErrors} />
            <TextField name="email" label="Email" type="email" required autoComplete="email" errors={action.fieldErrors} />
            <TextField name="phone" label="Phone" type="tel" autoComplete="tel" errors={action.fieldErrors} />
          </FieldRow>
          <TextAreaField name="note" label="Anything the landlord should know?" rows={2} errors={action.fieldErrors} />
          {/* Hidden from people; bots fill it in. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <div>
            <Button type="submit" busy={action.busy === 'book'} busyLabel="Booking…">
              Book {timeOf(open.find((s) => s.id === chosen)?.startsAt ?? '')}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
