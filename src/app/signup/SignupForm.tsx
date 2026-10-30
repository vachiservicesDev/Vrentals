'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/fields';

function friendly(message: string) {
  if (/already registered|already been registered|exists/i.test(message)) return 'That email already has an account. Sign in instead, or reset your password.';
  if (/password/i.test(message)) return 'Choose a longer password: at least 10 characters.';
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute, then try again.';
  if (/fetch|network/i.test(message)) return "Couldn't reach Rentals. Check your connection and try again.";
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
        data: { signup_role: 'landlord', full_name: String(form.get('fullName') ?? '').trim() },
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
      <TextField name="fullName" label="Your name" required hideOptional autoComplete="name" />
      <TextField name="email" label="Email" type="email" required hideOptional autoComplete="email" inputMode="email" />
      <TextField name="password" label="Password" type="password" required hideOptional autoComplete="new-password" hint="At least 10 characters." />
      <Button type="submit" size="lg" busy={busy} busyLabel="Creating account" className="w-full">
        Create account
      </Button>
    </form>
  );
}
