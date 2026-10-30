import { redirect } from 'next/navigation';
import { homeFor, loadSession } from '@/lib/auth/session';

export default async function RootPage() {
  const session = await loadSession();
  if (!session) redirect('/login');
  redirect(session.account ? homeFor(session.account.role) : '/no-access');
}
