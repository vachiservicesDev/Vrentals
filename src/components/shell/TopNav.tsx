'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; badge?: number };

/** Simple line icons for the phone tab bar, keyed by the tab's address. */
export const ICONS: Record<string, string> = {
  '/dashboard': 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  '/home': 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  '/reports': 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  '/reports/home': 'M4 20V10m6 10V4m6 16v-7m6 7H2',
  '/expenses': 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  '/notifications': 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  '/account': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7.5 8a7.5 7.5 0 0 1 15 0',
  '/platform': 'M4 6h16M4 12h16M4 18h10',
};

/** The line icon for a tab, a little heavier when it's the current one. */
export function NavIcon({ href, active, className = 'h-5 w-5' }: { href: string; active?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[href] ?? ICONS['/platform']} />
    </svg>
  );
}


/** The tabs under the top bar. They scroll sideways on small phones rather than wrapping. */
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // Home pages live under their own paths (/homes/[id] belongs to the Dashboard tab).
  const current = active ?? (pathname.startsWith('/homes/') ? '/dashboard' : undefined);

  return (
    <nav aria-label="Main" className="relative isolate -mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const on = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`group relative inline-flex min-h-12 shrink-0 items-center gap-2 px-3 text-[0.9375rem] font-medium transition-colors ${
              on ? 'text-brand-800' : 'text-ink-2 hover:text-brand-700'
            }`}
          >
            <span className={`absolute inset-x-1 inset-y-1.5 -z-10 rounded-lg transition-colors ${on ? 'bg-brand-50' : 'group-hover:bg-subtle'}`} aria-hidden="true" />
            <NavIcon href={item.href} active={on} />
            {item.label}
            {on && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-700" />}
            {!!item.badge && (
              <span className="rounded-full bg-accent-600 px-1.5 text-xs font-semibold leading-5 text-white">
                <span className="sr-only">, </span>
                {item.badge > 9 ? '9+' : item.badge}
                <span className="sr-only"> new</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
