'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';

function friendly(message: string) {
  if (/already registered|already been registered|exists/i.test(message)) return 'That email already has an account. Sign in instead, or reset your password.';
  if (/password/i.test(message)) return 'Choose a longer password: at least 10 characters.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute, then try again.';
  if (/fetch|network/i.test(message)) return "Couldn't reach Vrentals. Check your connection and try again.";
  return message;
}

/**
 * Landlord sign-up through Supabase Auth. The login is tagged signup_role "landlord"; the landlord
 * account itself is created on first sign-in (src/lib/auth/guards.ts). If the Supabase project
 * asks for email confirmation, the person confirms first and lands on /auth/confirm.
 */
export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'homeowner' | 'landlord'>('landlord');
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setError(null);
    if (password.length < 10) {
      setError('Choose a longer password: at least 10 characters.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setBusy(true);
    const { data, error: signUpError } = await createClient().auth.signUp({
      email,
      password,
      options: {
        data: { signup_role: 'landlord', account_kind: kind, full_name: String(form.get('fullName') ?? '').trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(friendly(signUpError.message));
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (data.session) window.location.assign('/dashboard');
    else setSentTo(email);
  }

  if (sentTo) {
    return (
      <p role="status" className="mt-6 rounded-md border border-line bg-subtle px-4 py-3 text-ink">
        Check <span className="font-medium">{sentTo}</span> for a link to confirm your account, then you&apos;re in.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-5">
      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-md border border-danger-700/30 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700 focus:outline-none">
          {error}
        </p>
      )}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">What will you use Vrentals for?</legend>
        {(
          [
            ['homeowner', 'The home I live in', 'Bills, repairs, documents and a year-end tax summary.'],
            ['landlord', 'Homes I rent out', 'Tenants, rent, leases, repairs and expenses.'],
          ] as const
        ).map(([value, title, text]) => (
          <label
            key={value}
            className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3 ${kind === value ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-600/20' : 'border-line-strong hover:border-brand-600'}`}
          >
            <input type="radio" name="accountKind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-1 h-4 w-4 accent-brand-700" />
            <span>
              <span className="block font-semibold text-ink">{title}</span>
              <span className="block text-sm text-ink-2">{text}</span>
            </span>
          </label>
        ))}
        <p className="text-sm text-muted">Both? Pick either one. You can add both kinds of home.</p>
      </fieldset>
      <TextField name="fullName" label="Your name" required hideOptional autoComplete="name" />
      <TextField name="email" label="Email" type="email" required hideOptional autoComplete="email" inputMode="email" />
      <TextField name="password" label="Password" type="password" required hideOptional autoComplete="new-password" hint="At least 10 characters." />
      <Button type="submit" size="lg" busy={busy} busyLabel="Creating account" className="w-full">
        Create account
      </Button>
    </form>
  );
}
