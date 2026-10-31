import { Logo } from '@/components/ui/Logo';
import { Footer } from '@/components/shell/Footer';

/** Public pages for a home for rent: no sign-in, no app tabs. */
export default function RentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center px-4 md:px-8">
          <Logo href={null} />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-8 md:py-10">
        {children}
      </main>
      <Footer width="max-w-3xl" note="Listed with Vrentals. We do business in accordance with the federal Fair Housing Act and state and local fair housing laws." />
    </>
  );
}
