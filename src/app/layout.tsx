import type { Metadata, Viewport } from 'next';
import { Instrument_Sans, JetBrains_Mono, Manrope } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/providers/toaster';
import { publicAppUrl } from '@/lib/env';
import './globals.css';

// Fonts. All three are variable families (no `weight` list, so each is ONE latin woff2 rather than
// one file per weight), `display: 'swap'` so text paints immediately in the metric-adjusted fallback,
// latin subset only.
//
// Only fonts the first paint of the SHOP needs are preloaded. Manrope (the shop's text and headings)
// and JetBrains Mono (every price and number) are; Instrument Sans only styles the staff dashboard
// and portals, so it loads when something actually uses it instead of competing with the hero image
// and the shop's own fonts on every storefront view.
//
// Instrument Sans over Inter/Geist: those two are the visual signature of
// generated dashboards. JetBrains Mono carries every number in the app.
const sans = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-instrument-sans',
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

// Manrope carries the shop's text and every heading; Instrument Sans stays for the dense staff
// interface, JetBrains Mono for dashboard figures.
const display = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
  title: { default: 'NextX Dashboard 2.0', template: '%s · NextX Dashboard 2.0' },
  description: 'NextX operations, inventory, orders, storefront and finance.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#080d13' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en-SR"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
    >
      <body className="min-h-dvh bg-base text-ink antialiased">
        <NuqsAdapter>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
