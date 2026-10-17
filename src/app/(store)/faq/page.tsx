import type { Metadata } from 'next';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Veelgestelde vragen | NextX Suriname',
  description: 'Antwoorden op vragen over NextX, bestellen en afhalen in Suriname.',
  alternates: { canonical: '/faq' },
  robots: { index: false, follow: true },
};

export default async function FaqPage() {
  const settings = await getSettings();
  const contact = whatsappLink(settings?.whatsapp, 'Hallo NextX, ik heb een vraag.');

  return (
    <article className="mx-auto w-full max-w-[1320px] px-4 py-12 sm:py-16 lg:px-8">
      <header className="max-w-2xl">
        <p className="nx-label text-ink-3">NextX service</p>
        <h1 className="nx-display mt-3 text-[clamp(36px,6vw,64px)] text-ink">
          Veelgestelde vragen
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Vind antwoorden op vragen over onze producten en service.
        </p>
      </header>

      <section aria-labelledby="faq-empty-title" className="store-card mt-10 p-6 sm:p-8">
        <h2 id="faq-empty-title" className="text-lg font-semibold text-ink">
          Er zijn nog geen vragen gepubliceerd.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Heb je hulp nodig met een bestelling, product of afhaallocatie? Neem contact op met
          NextX.
        </p>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-ink mt-5"
          >
            Contact via WhatsApp
          </a>
        ) : null}
      </section>
    </article>
  );
}
