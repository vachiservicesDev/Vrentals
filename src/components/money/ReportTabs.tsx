import Link from 'next/link';

/** Switches between the rental profit & loss and the homeowner tax summary. */
export function ReportTabs({ current }: { current: 'rentals' | 'home' }) {
  const tab = (key: 'rentals' | 'home', href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={`inline-flex min-h-11 items-center rounded-md px-4 font-semibold ${current === key ? 'bg-brand-700 text-white' : 'border border-line bg-white text-brand-700 hover:bg-subtle'}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Reports" className="no-print mb-6 flex flex-wrap gap-2">
      {tab('rentals', '/reports', 'Rentals: profit & loss')}
      {tab('home', '/reports/home', 'My home: tax summary')}
    </nav>
  );
}
