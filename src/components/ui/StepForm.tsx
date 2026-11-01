'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';
import { Check } from './Check';

export interface Step {
  title: string;
  /** One short line under the step's title: what this step is for. */
  hint?: ReactNode;
  content: ReactNode;
}

/**
 * A long form shown one short step at a time: fill in a few fields, press Next, and the next step
 * comes up. A bar at the top shows where you are. Every step stays in the form (just hidden), so
 * the final Save sends everything at once, exactly like one long form would.
 *
 * Next checks only the current step's required fields. If the server sends back field errors, the
 * form jumps to the first step that has one.
 */
export function StepForm({
  steps,
  onSubmit,
  submitLabel,
  busy = false,
  busyLabel = 'Saving…',
  fieldErrors = {},
  status,
  id,
}: {
  steps: Step[];
  onSubmit: (form: HTMLFormElement) => void;
  submitLabel: string;
  busy?: boolean;
  busyLabel?: string;
  fieldErrors?: Record<string, string>;
  /** Shown above the current step: the save's error or success message. */
  status?: ReactNode;
  id?: string;
}) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  const last = step === steps.length - 1;

  // A server error on a field in an earlier step: go to that step.
  const errorKey = Object.keys(fieldErrors).join(',');
  useEffect(() => {
    if (!errorKey) return;
    const names = errorKey.split(',');
    const at = panes.current.findIndex((p) => p && names.some((n) => p.querySelector(`[name="${CSS.escape(n)}"]`)));
    if (at >= 0) setStep(at);
  }, [errorKey]);

  function go(to: number) {
    setStep(to);
    setReached((r) => Math.max(r, to));
    requestAnimationFrame(() => {
      const top = topRef.current;
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panes.current[to]?.querySelector<HTMLElement>('input:not([type=hidden]):not([readonly]), select, textarea')?.focus({ preventScroll: true });
    });
  }

  /** True when every field in the current step passes its own checks (required, type, min/max). */
  function stepValid() {
    const fields = panes.current[step]?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? [];
    for (const f of fields) {
      if (!f.checkValidity()) {
        f.reportValidity();
        f.focus();
        return false;
      }
    }
    return true;
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stepValid()) return;
    if (!last) return go(step + 1);
    onSubmit(e.currentTarget);
  }

  const pct = Math.round(((step + 1) / steps.length) * 100);

  return (
    <form ref={formRef} id={id} onSubmit={submit} noValidate className="grid gap-6">
      <div ref={topRef} className="grid scroll-mt-28 gap-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold text-ink">
            Step {step + 1} of {steps.length}: {steps[step].title}
          </p>
          <span className="tabular-nums text-muted">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Form progress">
          <div className="h-full rounded-full bg-brand-700 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <ol className="hidden flex-wrap gap-2 sm:flex">
          {steps.map((s, i) => {
            const done = i < step;
            const open = i <= reached && i !== step;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => go(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${
                    i === step ? 'bg-brand-700 text-white' : done ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : open ? 'bg-subtle text-ink-2 hover:bg-line' : 'bg-subtle text-muted'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {status}

      {steps.map((s, i) => (
        <div key={s.title} ref={(el) => void (panes.current[i] = el)} hidden={i !== step} className="grid gap-5">
          {s.hint && <p className="text-ink-2">{s.hint}</p>}
          {s.content}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        {step > 0 && (
          <Button variant="secondary" onClick={() => go(step - 1)}>
            Back
          </Button>
        )}
        <Button type="submit" busy={last && busy} busyLabel={busyLabel} className="sm:ml-auto">
          {last ? submitLabel : `Next: ${steps[step + 1].title}`}
        </Button>
      </div>
    </form>
  );
}
