import type { Metadata } from 'next';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Klantervaringen | NextX Suriname',
  description: 'Lees ervaringen van klanten van NextX Audio.',
  alternates: { canonical: '/testimonials' },
  robots: { index: false, follow: true },
};

export default async function TestimonialsPage() {
  const settings = await getSettings();
  const contact = whatsappLink(
    settings?.whatsapp,
    'Hallo NextX, ik wil graag mijn ervaring delen.',
  );

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16 lg:px-6">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          NextX klanten
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
          Wat onze klanten zeggen
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Lees de ervaringen van klanten en ontdek waarom ze voor NextX kiezen.
        </p>
      </header>

      <section
        aria-labelledby="testimonials-empty-title"
        className="store-card mt-10 p-6 sm:p-8"
      >
        <h2 id="testimonials-empty-title" className="text-lg font-semibold text-ink">
          Er zijn nog geen klantreviews gepubliceerd.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Heb je iets bij NextX gekocht? Deel je ervaring met ons.
        </p>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-10 items-center rounded-full bg-store-navy px-5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Deel je ervaring via WhatsApp
          </a>
        ) : null}
      </section>
    </article>
  );
}
