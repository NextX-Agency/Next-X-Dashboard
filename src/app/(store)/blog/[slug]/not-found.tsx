import type { Route } from 'next';
import Link from 'next/link';

export default function BlogPostNotFound() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center lg:px-6">
      <p className="nx-label text-ink-3">NextX blog</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
        Article not found
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-3">
        This article is not available. See the NextX blog for published articles.
      </p>
      <Link href={'/blog' as Route} className="nx-btn nx-btn-primary mt-5">
        Back to the blog
      </Link>
    </section>
  );
}
