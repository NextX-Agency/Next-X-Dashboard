import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles and product tips from NextX.',
  alternates: { canonical: '/blog' },
  robots: { index: false, follow: true },
};

export default function BlogPage() {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16 lg:px-6">
      <header className="max-w-2xl">
        <p className="nx-label text-ink-3">NextX blog</p>
        <h1 className="nx-display mt-3 text-[clamp(36px,6vw,64px)] text-ink">
          Articles and product tips
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-3">
          Tips and insights about our products and service.
        </p>
      </header>

      <section aria-labelledby="blog-empty-title" className="store-card mt-10 p-6 sm:p-8">
        <h2 id="blog-empty-title" className="text-lg font-semibold text-ink">
          No articles have been published yet.
        </h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-3">
          Browse what NextX sells today.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/shop" className="nx-btn nx-btn-primary">
            Browse the shop
          </Link>
        </div>
      </section>
    </article>
  );
}
