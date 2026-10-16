import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog | NextX Suriname',
  description: 'Artikelen en producttips van NextX Audio.',
  alternates: { canonical: '/blog' },
  robots: { index: false, follow: true },
};

export default function BlogPage() {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16 lg:px-6">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
          NextX journal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">
          Artikelen en producttips
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Ontdek tips en inzichten over onze producten en service.
        </p>
      </header>

      <section aria-labelledby="blog-empty-title" className="store-card mt-10 p-6 sm:p-8">
        <h2 id="blog-empty-title" className="text-lg font-semibold text-ink">
          Er zijn op dit moment geen artikelen gepubliceerd.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Bekijk de huidige collectie van NextX Audio.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/audio"
            className="inline-flex min-h-10 items-center rounded-full bg-store-navy px-5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Bekijk Audio
          </Link>
        </div>
      </section>
    </article>
  );
}
