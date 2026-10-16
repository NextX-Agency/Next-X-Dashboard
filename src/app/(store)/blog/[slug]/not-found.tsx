import type { Route } from 'next';
import Link from 'next/link';

export default function BlogPostNotFound() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center lg:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        NextX journal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
        Artikel niet gevonden
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
        Dit artikel is niet beschikbaar. Bekijk het NextX-journal voor gepubliceerde artikelen.
      </p>
      <Link
        href={'/blog' as Route}
        className="mt-6 inline-flex min-h-10 items-center rounded-full bg-store-navy px-5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Terug naar het journal
      </Link>
    </section>
  );
}
