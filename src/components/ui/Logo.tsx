import Link from 'next/link';

type Props = { className?: string; href?: string | null; label?: string; priority?: boolean };

/** The Vrentals wordmark: a roof-and-check mark and the name, with the V in clay. Drawn inline, no image files. */
export function Logo({ className = '', href = '/', label = 'Vrentals home' }: Props) {
  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="8" fill="var(--color-brand-700)" />
        {/* A roof over a V that doubles as a check mark: your home, taken care of. */}
        <path d="M6.5 14.5 16 7l9.5 7.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 17.5 16 24.5l5.5-7" fill="none" stroke="var(--color-accent-500)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-brand-900">
        <span className="text-accent-500">V</span>rentals
      </span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label={label} className="inline-flex shrink-0 items-center rounded-sm">
      {mark}
    </Link>
  );
}
