import { redirect } from 'next/navigation';
import { Logo } from '@/components/ui/Logo';
import { buttonClass } from '@/components/ui/Button';
import { TopNav } from '@/components/shell/TopNav';
import { homeFor, requireSession } from '@/lib/auth/session';
import { signOutAction } from '../actions';

/** Signed-in pages: a top bar with the tabs for the person's role. API routes still check access themselves. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!session.account) redirect('/no-access');
  if (!session.account.isActive) redirect('/auth/signout?reason=deactivated');

  const landlord = session.account.role === 'landlord';
  const items = landlord
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/reports', label: 'Money & taxes' },
        { href: '/notifications', label: 'Notifications', badge: session.unread },
        { href: '/account', label: 'Account' },
      ]
    : [
        { href: '/home', label: 'My home' },
        { href: '/notifications', label: 'Notifications', badge: session.unread },
        { href: '/account', label: 'Account' },
      ];

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-[var(--shadow-float)]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="flex min-h-16 items-center justify-between gap-4">
            <Logo href={homeFor(session.account.role)} />
            <div className="flex items-center gap-3">
              <span className="hidden max-w-56 truncate text-sm text-muted sm:inline">{session.email}</span>
              <form action={signOutAction}>
                <button type="submit" className={buttonClass('ghost', 'sm')}>
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <TopNav items={items} />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 focus:outline-none md:px-8 md:py-10">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-5 text-sm text-muted sm:flex-row sm:justify-between md:px-8">
          <p>Rentals</p>
          <p>{landlord ? 'Your homes, rent, repairs and bills in one place.' : 'Questions about your home? Contact your landlord.'}</p>
        </div>
      </footer>
    </>
  );
}
