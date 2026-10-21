import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SHOP_PATH } from '@/lib/storefront-domain';

/**
 * Categories as filter chips: the way a customer narrows the catalogue. Plain links, so they work
 * without JavaScript and are shareable. A chip is only offered for a category that has public products.
 */
export function CategoryChips({
  categories,
  total,
  active,
}: {
  categories: { slug: string; name: string; count: number }[];
  total: number;
  /** Slug of the selected category; `null` highlights "All". `undefined` highlights nothing (home). */
  active?: string | null;
}) {
  if (categories.length < 2) return null;
  const chip = (selected: boolean) =>
    cn(
      'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 font-semibold text-[14px] transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      selected
        ? 'border-cta bg-cta text-cta-fg'
        : 'border-line-strong bg-raised text-ink hover:border-accent hover:text-accent',
    );
  return (
    <nav
      aria-label="Categories"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      <Link
        href={SHOP_PATH as never}
        aria-current={active === null ? 'page' : undefined}
        className={chip(active === null)}
      >
        All <span className={active === null ? 'text-cta-fg' : 'text-ink-3'}>{total}</span>
      </Link>
      {categories.map((category) => {
        const selected = active === category.slug;
        return (
          <Link
            key={category.slug}
            href={`${SHOP_PATH}?category=${category.slug}` as never}
            aria-current={selected ? 'page' : undefined}
            className={chip(selected)}
          >
            {category.name}
            <span className={selected ? 'text-cta-fg' : 'text-ink-3'}>{category.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
