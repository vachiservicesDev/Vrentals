import Link from 'next/link';
import { InstallApp } from './InstallApp';

type FooterLink = { href: string; label: string };

/**
 * The footer on every page: the mark and what Vrentals is for, the main places to go, a way to
 * add the app to a phone's home screen, and the fine print. On phones it clears the tab bar.
 */
export function Footer({ links = [], note, withTabBar = false, width = 'max-w-5xl' }: { links?: FooterLink[]; note?: string; withTabBar?: boolean; width?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`no-print border-t border-line bg-white ${withTabBar ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-0' : 'pb-[env(safe-area-inset-bottom)]'}`}>
      <div className={`mx-auto grid w-full ${width} gap-6 px-4 py-8 md:grid-cols-[1.4fr_1fr] md:px-8`}>
        <div className="grid content-start gap-3">
          <p className="inline-flex items-center gap-2">
            <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 shrink-0">
              <rect width="32" height="32" rx="8" fill="var(--color-brand-700)" />
              <path d="M6.5 14.5 16 7l9.5 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 17.5 16 24.5l5.5-7" fill="none" stroke="var(--color-accent-500)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-display text-lg font-semibold text-brand-900">
              <span className="text-accent-600">V</span>rentals
            </span>
          </p>
          <p className="max-w-sm text-sm text-ink-2">{note ?? 'Rent, repairs, bills and taxes for the homes you rent out and the home you live in.'}</p>
          <InstallApp />
        </div>
        {links.length > 0 && (
          <nav aria-label="Footer">
            <ul className="grid grid-cols-2 gap-x-6 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-ink-2 hover:text-brand-700 hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="border-t border-line">
        <p className={`mx-auto w-full ${width} px-4 py-4 text-xs text-muted md:px-8`}>
          © {year} Vachi Services · Vrentals keeps your records; it isn&apos;t tax or legal advice.
        </p>
      </div>
    </footer>
  );
}
