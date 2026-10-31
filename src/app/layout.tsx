import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Vrentals', template: '%s · Vrentals' },
  description: 'Run your rental homes in one place: rent, repairs, insurance and HOA, with a portal for your tenants.',
  applicationName: 'Vrentals',
  // Opens full screen from the iPhone home screen, with the green status bar.
  appleWebApp: { capable: true, title: 'Vrentals', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  // Lets the page reach the edges on phones with a notch; headers and the tab bar pad for it.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-subtle">{children}</body>
    </html>
  );
}
