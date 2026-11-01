'use client';

import { LEASING_STEPS } from '@/lib/rentals/leasingPath';
import { Check } from '@/components/ui/Check';

/**
 * The leasing progress bar: Application, Review, Lease drafting, Signing, Move-in, Active lease.
 * Done steps are ticked, the current one is dark, and choosing a step shows what it needs.
 * On a phone the bar scrolls sideways and keeps the chosen step in view.
 */
export function LeasingPath({ current, selected, onSelect, who }: { current: number; selected?: number; onSelect?: (step: number) => void; who?: (step: number) => string }) {
  const pct = Math.round((current / (LEASING_STEPS.length - 1)) * 100);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm font-semibold text-ink">
          {current === LEASING_STEPS.length - 1 ? 'All steps done' : `Step ${current + 1} of ${LEASING_STEPS.length}: ${LEASING_STEPS[current].label}`}
          {who && current < LEASING_STEPS.length - 1 && <span className="font-normal text-muted"> · {who(current)}</span>}
        </p>
        <div className="flex items-center gap-2 text-sm text-muted">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Leasing progress">
            <div className="h-full rounded-full bg-brand-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums">{pct}%</span>
        </div>
      </div>
      <nav aria-label="Leasing steps" className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="flex min-w-[46rem]">
          {LEASING_STEPS.map((s, i) => {
            const state = i < current ? 'done' : i === current ? 'current' : 'todo';
            const first = i === 0;
            const last = i === LEASING_STEPS.length - 1;
            const shape = first
              ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
              : last
                ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
                : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';
            const colors = state === 'done' ? 'bg-brand-50 text-brand-800' : state === 'current' ? 'bg-brand-800 text-white' : 'bg-subtle text-ink-2';
            const content = (
              <>
                {state === 'done' ? <Check className="h-3.5 w-3.5 shrink-0" /> : <span className="tabular-nums opacity-80">{i + 1}</span>}
                <span>{s.label}</span>
              </>
            );
            const cls = `relative flex h-11 w-full items-center justify-center gap-1.5 whitespace-nowrap text-[0.8125rem] font-semibold ${first ? 'rounded-l-full pl-3 pr-4' : last ? 'rounded-r-full pl-5 pr-3' : 'pl-5 pr-4'} ${colors} ${
              selected === i ? 'shadow-[inset_0_-3px_0_var(--color-accent-600)]' : ''
            }`;
            return (
              <li key={s.key} className={`min-w-0 flex-1 ${last ? '' : '-mr-2'}`}>
                {onSelect ? (
                  <button type="button" onClick={() => onSelect(i)} aria-current={i === current ? 'step' : undefined} aria-pressed={selected === i} className={`${cls} hover:brightness-95`} style={{ clipPath: shape }}>
                    {content}
                  </button>
                ) : (
                  <span aria-current={i === current ? 'step' : undefined} className={cls} style={{ clipPath: shape }}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
