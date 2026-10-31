'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; badge?: number };

/** The tabs under the top bar. They scroll sideways on small phones rather than wrapping. */
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  // Home pages live under their own paths (/homes/[id] belongs to the Dashboard tab).
  const current = active ?? (pathname.startsWith('/homes/') ? '/dashboard' : undefined);

  return (
    <nav aria-label="Main" className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const on = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[0.9375rem] font-medium transition-colors ${
              on ? 'border-accent-600 text-brand-900' : 'border-transparent text-ink-2 hover:text-brand-700'
            }`}
          >
            {item.label}
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
