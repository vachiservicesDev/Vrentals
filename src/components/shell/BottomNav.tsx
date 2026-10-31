'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon, type NavItem } from './TopNav';

/**
 * The tab bar along the bottom on phones, like an iPhone or Android app. It sits above the home
 * indicator (safe area) and replaces the top tabs below the `sm` breakpoint.
 */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const current = active ?? (pathname.startsWith('/homes/') ? '/dashboard' : undefined);

  return (
    <nav aria-label="Main" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const on = item.href === current;
          const label = item.label === 'Money & taxes' ? 'Money' : item.label === 'Notifications' ? 'Alerts' : item.label === 'Landlord plans' ? 'Plans' : item.label;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={on ? 'page' : undefined}
                aria-label={item.badge ? `${item.label}, ${item.badge} new` : item.label}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors ${on ? 'text-brand-700' : 'text-muted active:text-brand-700'}`}
              >
                <NavIcon href={item.href} active={on} className="h-6 w-6" />
                {on && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-brand-700" />}
                {label}
                {!!item.badge && (
                  <span aria-hidden="true" className="absolute left-1/2 top-1.5 ml-2 rounded-full bg-accent-600 px-1.5 text-[0.625rem] font-semibold leading-4 text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
