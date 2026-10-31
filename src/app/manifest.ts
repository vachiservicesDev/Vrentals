import type { MetadataRoute } from 'next';

/** Lets Android and desktop browsers install Vrentals like an app, opening full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vrentals',
    short_name: 'Vrentals',
    description: 'Rent, repairs, bills and taxes for the homes you rent out and the home you live in.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#faf7f2',
    theme_color: '#215a42',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
