import { DM_Sans, Playfair_Display, JetBrains_Mono } from 'next/font/google';
import Providers from './providers';
import '../styles/globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
});
const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata = {
  title: { default: 'Bookalocal — Book Verified Local Guides in Nepal', template: '%s | Bookalocal' },
  description: 'Discover and book trusted local guides for trekking, cultural tours, photography tours, and more in Nepal. Authentic experiences with verified guides.',
  keywords: ['Nepal trekking guides', 'local guides Nepal', 'Everest Base Camp guide', 'Kathmandu tour guide', 'Annapurna trekking'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://bookalocal.com',
    siteName: 'Bookalocal',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', site: '@bookalocal' },
  manifest: '/manifest.json',
  themeColor: '#E85A1E',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bookalocal',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${playfair.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
