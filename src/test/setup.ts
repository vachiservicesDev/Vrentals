import { vi } from 'vitest';
import { authState } from './mockAuth';

if (!process.env.DATABASE_URL?.includes('test')) {
  throw new Error('DATABASE_URL must point at a database with "test" in its name - the suite truncates every table.');
}

// Supabase Auth isn't reachable here and isn't what these tests are about: this stands in for
// supabase.auth.getUser() only. Every database read and write still runs for real.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.userId ? { id: authState.userId, email: authState.email, user_metadata: authState.userMetadata } : null },
      }),
    },
  }),
}));
