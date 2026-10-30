import { defineConfig } from 'drizzle-kit';

// DATABASE_URL: the Supabase Postgres connection string ("Session" mode for drizzle-kit).
// Everything this app owns is in the `rentals` schema; drizzle-kit is limited to it so it never
// touches another app's tables in the same database.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['rentals'],
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  strict: true,
  verbose: true,
});
