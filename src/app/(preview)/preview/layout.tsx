import type { Metadata } from 'next';
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans_Condensed,
  Instrument_Serif,
  Manrope,
} from 'next/font/google';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * DESIGN PREVIEW ONLY. Three working visual directions rendered from real catalogue content, so the owner
 * can compare them before anything is built site-wide.
 *
 * Never reachable in production: the layout 404s when NODE_ENV is production, and the routes are not in
 * the public-path list, so the proxy sends signed-out visitors to /login on any deployed host as well.
 * Nothing here reads or writes the database.
 */
export const metadata: Metadata = {
  title: 'Design preview',
  robots: { index: false, follow: false },
};

const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-pv-serif',
});
const condensed = IBM_Plex_Sans_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-pv-condensed',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-pv-mono',
});
const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pv-manrope',
});

export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div
      className={`${serif.variable} ${condensed.variable} ${plexMono.variable} ${manrope.variable}`}
    >
      {children}
    </div>
  );
}
