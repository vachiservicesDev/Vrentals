import Link from 'next/link';

/** Switches between the rental profit & loss and the homeowner tax summary. */
export function ReportTabs({ current }: { current: 'rentals' | 'home' }) {
  const tab = (key: 'rentals' | 'home', href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={`inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${
        current === key ? 'bg-white text-brand-800 shadow-[0_1px_3px_rgb(31_27_22/0.12)]' : 'text-ink-2 hover:text-brand-700'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Reports" className="no-print mb-6 flex w-full gap-1 rounded-xl border border-line bg-subtle p-1 sm:inline-flex sm:w-auto">
      {tab('rentals', '/reports', 'Rentals: profit & loss')}
      {tab('home', '/reports/home', 'My home: tax summary')}
    </nav>
  );
}
