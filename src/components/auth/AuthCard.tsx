import type { ReactNode } from 'react';
import { Logo } from '@/components/ui/Logo';
import { Footer } from '@/components/shell/Footer';

/** The centred card used by sign-in, sign-up, password reset and set-password. */
export function AuthCard({ title, lead, children, footer }: { title: string; lead?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
    <main id="main" className="grid-bg flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo href={null} />
        </div>
        <div className="rounded-lg border border-line bg-white p-6 shadow-[var(--shadow-panel)] md:p-8">
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          {lead && <p className="mt-2 text-ink-2">{lead}</p>}
          {children}
        </div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
    <Footer />
    </>
  );
}
