import type { Metadata } from 'next';
import { enquiryMessage } from '@/lib/store-messages';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Frequently asked questions',
  description: 'Answers to questions about NextX, ordering and pickup in Suriname.',
  alternates: { canonical: '/faq' },
  robots: { index: false, follow: true },
};

export default async function FaqPage() {
  const settings = await getSettings();
  const contact = whatsappLink(settings?.whatsapp, enquiryMessage('NextX'));

  return (
    <article className="mx-auto w-full max-w-[1320px] px-4 py-12 sm:py-16 lg:px-8">
      <header className="max-w-2xl">
        <p className="nx-label text-ink-3">NextX service</p>
        <h1 className="nx-display mt-3 text-[clamp(36px,6vw,64px)] text-ink">
          Frequently asked questions
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Find answers to questions about our products and service.
        </p>
      </header>

      <section aria-labelledby="faq-empty-title" className="store-card mt-10 p-6 sm:p-8">
        <h2 id="faq-empty-title" className="text-lg font-semibold text-ink">
          No questions have been published yet.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Need help with an order, a product or a pickup location? Get in touch with NextX.
        </p>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-primary mt-5"
          >
            Contact us on WhatsApp
          </a>
        ) : null}
      </section>
    </article>
  );
}
