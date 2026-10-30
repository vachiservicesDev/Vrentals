/** Mutable current-test-user state, read by the mocked supabase/server client in setup.ts. */
export const authState: { userId: string | null; email: string | undefined; userMetadata: Record<string, unknown> } = { userId: null, email: undefined, userMetadata: {} };

export function setCurrentUser(id: string | null, userMetadata: Record<string, unknown> = {}, email?: string): void {
  authState.userId = id;
  authState.email = email;
  authState.userMetadata = userMetadata;
}
