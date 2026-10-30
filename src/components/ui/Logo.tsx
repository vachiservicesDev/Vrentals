import Link from 'next/link';

type Props = { className?: string; href?: string | null; label?: string; priority?: boolean };

/** The Rentals wordmark: a small house mark and the name. Drawn inline, no image files. */
export function Logo({ className = '', href = '/', label = 'Rentals home' }: Props) {
  const mark = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-8 w-8 shrink-0">
        <rect width="32" height="32" rx="8" fill="var(--color-brand-700)" />
        <path d="M8 15.5 16 9l8 6.5V24a1 1 0 0 1-1 1h-4.5v-5.5h-5V25H9a1 1 0 0 1-1-1z" fill="#fff" />
        <circle cx="23.5" cy="9" r="2.5" fill="var(--color-accent-500)" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-brand-900">Rentals</span>
    </span>
  );
  if (!href) return mark;
  return (
    <Link href={href} aria-label={label} className="inline-flex shrink-0 items-center rounded-sm">
      {mark}
    </Link>
  );
}
