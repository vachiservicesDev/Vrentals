'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Result {
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

const SearchIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

/**
 * Search everything from the top bar: homes, tenants, repairs, bills, expenses and documents
 * (staff also find accounts). Type two letters and matches appear; arrow keys and Enter open one.
 * Press "/" anywhere to jump to it. On a phone it opens full width from the search button.
 */
export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (!ctl.signal.aborted) {
        setResults(data?.results ?? []);
        setActive(0);
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        setPhoneOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(r: Result) {
    setOpen(false);
    setPhoneOpen(false);
    setQ('');
    router.push(r.href);
  }

  const showList = open && q.trim().length >= 2;
  const panel = (
    <div className="relative w-full">
      <label htmlFor="global-search" className="sr-only">
        Search
      </label>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <SearchIcon className="h-4.5 w-4.5" />
      </span>
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        autoComplete="off"
        placeholder="Search homes, tenants, bills…"
        value={q}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            setPhoneOpen(false);
          }
        }}
        className="min-h-11 w-full rounded-[10px] border border-line-strong bg-white pl-9 pr-3 text-[0.9375rem] text-ink placeholder:text-muted focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-[var(--shadow-float)]">
          {loading && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted">Nothing matches &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Search results">
              {results.map((r, i) => (
                <li
                  key={`${r.type}-${r.href}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    go(r);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${i === active ? 'bg-brand-50' : ''}`}
                >
                  <span className="mt-0.5 w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-accent-700">{r.type}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-sm text-muted">{r.subtitle}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={
          phoneOpen
            ? 'fixed inset-x-0 top-0 z-50 flex items-center gap-2 border-b border-line bg-white px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-[var(--shadow-float)] md:static md:z-auto md:block md:w-full md:max-w-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none'
            : 'hidden md:block md:w-full md:max-w-sm'
        }
      >
        {panel}
        <button type="button" onClick={() => setPhoneOpen(false)} className="min-h-11 shrink-0 px-2 font-medium text-brand-700 md:hidden">
          Close
        </button>
      </div>
      <button
        type="button"
        aria-label="Search"
        onClick={() => {
          setPhoneOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-ink-2 hover:bg-subtle md:hidden"
      >
        <SearchIcon />
      </button>
    </>
  );
}
