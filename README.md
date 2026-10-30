# Rentals

A standalone app for running rental homes: landlords track rent, schedule repairs and keep
insurance, HOA and tax dates in one place; tenants sign in to see their rent, report repairs and
see when someone is coming. It has its own look, login and address, separate from any other app.

## What's built

**Landlords** (`/dashboard`, `/homes/[id]`)
- Sign up at `/signup` (free for now; paid plans come later).
- Dashboard: rent collected vs expected this month, who's behind, open repairs (urgent first),
  bills due in 30 days, and every home.
- "Add a month's rent" adds that month for every active lease that covers it. Running it twice never
  charges twice.
- Each home has these sections:
  - Tenant and lease, with Connecticut defaults: rent is late only after a 9-day grace period, and
    the form notes the deposit cap.
  - Invite the tenant by email, or with a link to text them.
  - A rent ledger with payments recorded by hand (Zelle, check, cash...).
  - Repairs with a visit time, vendor, cost and private notes.
  - Reminders that repeat monthly, quarterly or yearly and roll forward when marked paid.
  - HOA details.
- Each landlord sees only their own homes (`properties.owner_id`).

**Tenants** (`/home`)
- Rent history and what's due, lease terms, the landlord's contact details.
- Report a repair (the landlord is notified, urgent ones flagged); see the scheduled visit and
  when it's fixed. Repair cost and private notes stay landlord-only.
- Access ends when the lease is ended.

**Both**: in-app notifications (`/notifications`) and account details (`/account`).

Not yet: online rent payments (Stripe), repair photos, email/text reminders, listing to rental
sites, screening and e-signed leases, expense reports, paid plans.

## Architecture

- Next.js 14 (App Router), TypeScript, Tailwind v4, Drizzle ORM, Supabase Auth.
- All tables live in the Postgres schema `rentals` (`src/db/schema.ts`), so the app can share a
  Supabase project with other apps without touching their tables. `drizzle.config.ts` is limited
  to that schema.
- Authorization is in application code: Drizzle's connection bypasses RLS, so every API route
  starts with `requireLandlord()` or `requireAccount()` (`src/lib/auth/guards.ts`) and scopes by the
  caller's account. RLS is enabled on every table with no policies, which keeps them closed to
  Supabase's public API keys.
- A login has access only if it has a row in `rentals.accounts`: landlords get one on first
  sign-in after signing up here; tenants get one when invited. Other logins in the same Supabase
  project see "No Rentals account".

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in
psql "$DATABASE_URL" -f src/db/migrations/0000_init.sql
npm run dev
```

Invite and reset links go straight to this app's `/auth/confirm`, so they don't depend on
Supabase's Site URL. For landlord sign-up email confirmation, add `<app url>/auth/confirm` to the
Supabase Auth redirect allow-list.

## Tests

```bash
createdb rentals_test
psql postgresql://localhost/rentals_test -f src/db/migrations/0000_init.sql
DATABASE_URL=postgresql://localhost/rentals_test npm test
```

The suite runs the real API routes against Postgres, with Supabase Auth mocked. It covers rent math
and the grace period, landlord isolation, role checks, one active lease per home, idempotent rent,
payments, tenant invites, what tenants can and can't see, repair notifications, ending a lease, and
landlord sign-up.
