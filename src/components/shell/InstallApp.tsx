'use client';

import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * "Add Vrentals to your home screen". On Android (Chrome, Edge, Samsung Internet) it opens the
 * browser's install prompt; on iPhone and iPad, which have no prompt, it shows the Share steps.
 * Hidden once the app is running from the home screen.
 */
export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!event && !ios)) return null;

  async function install() {
    if (event) {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setEvent(null);
    } else setShowSteps((v) => !v);
  }

  return (
    <div className="no-print">
      <button type="button" onClick={install} className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700 hover:underline">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
        </svg>
        Add Vrentals to your home screen
      </button>
      {showSteps && (
        <p className="mt-1 max-w-sm text-sm text-ink-2">
          In Safari, tap the Share button <span aria-hidden="true">(the square with an arrow)</span>, then <strong>Add to Home Screen</strong>. Vrentals opens full screen, like any other app.
        </p>
      )}
    </div>
  );
}
