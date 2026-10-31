import { Logo } from '@/components/ui/Logo';

/** Public pages for a home for rent: no sign-in, no app tabs. */
export default function RentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center px-4 md:px-8">
          <Logo href={null} />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-8 md:py-10">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 text-sm text-muted md:px-8">
          Listed with Vrentals. We do business in accordance with the federal Fair Housing Act and state and local fair housing laws.
        </div>
      </footer>
    </>
  );
}
