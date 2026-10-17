import type { Metadata } from 'next';
import { shareExperienceMessage } from '@/lib/store-messages';
import { whatsappLink } from '@/lib/whatsapp';
import { getSettings } from '@/server/queries/reference';

export const metadata: Metadata = {
  title: 'Customer experiences | NextX Suriname',
  description: 'What customers say about NextX.',
  alternates: { canonical: '/testimonials' },
  robots: { index: false, follow: true },
};

export default async function TestimonialsPage() {
  const settings = await getSettings();
  const contact = whatsappLink(settings?.whatsapp, shareExperienceMessage('NextX'));

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16 lg:px-6">
      <header className="max-w-2xl">
        <p className="nx-label text-ink-3">NextX customers</p>
        <h1 className="nx-display mt-3 text-[clamp(36px,6vw,64px)] text-ink">
          What our customers say
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Read what customers say about shopping with NextX.
        </p>
      </header>

      <section
        aria-labelledby="testimonials-empty-title"
        className="store-card mt-10 p-6 sm:p-8"
      >
        <h2 id="testimonials-empty-title" className="text-lg font-semibold text-ink">
          No customer reviews have been published yet.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Bought something from NextX? Share your experience with us.
        </p>
        {contact ? (
          <a
            href={contact}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-primary mt-5"
          >
            Share your experience on WhatsApp
          </a>
        ) : null}
      </section>
    </article>
  );
}
