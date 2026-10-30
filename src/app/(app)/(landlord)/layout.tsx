import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';

/** Landlord pages; tenants are sent to their own home page. */
export default async function LandlordLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.account?.role !== 'landlord') redirect('/home');
  return <>{children}</>;
}
