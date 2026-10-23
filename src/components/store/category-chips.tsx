import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SHOP_PATH } from '@/lib/storefront-domain';

/**
 * Categories as a single line of text links, the active one underlined in the brand orange. Plain
 * links, so they work without JavaScript and are shareable. A category is only listed when it has
 * public products. No counts and no pills: the grid below is the count.
 */
export function CategoryChips({
  categories,
  active,
}: {
  categories: { slug: string; name: string }[];
  /** Slug of the selected category; `null` marks "All". `undefined` marks nothing. */
  active?: string | null;
}) {
  if (categories.length < 2) return null;
  const item = (selected: boolean) =>
    cn(
      '-mb-px inline-flex h-11 shrink-0 items-center border-b-2 font-semibold text-[15px] transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      selected
        ? 'border-store-bright text-ink'
        : 'border-transparent text-ink-3 hover:text-ink',
    );
  return (
    <nav
      aria-label="Categories"
      className="-mx-4 flex gap-6 overflow-x-auto border-line border-b px-4 [scrollbar-width:none] lg:mx-0 lg:px-0"
    >
      <Link
        href={SHOP_PATH as never}
        aria-current={active === null ? 'page' : undefined}
        className={item(active === null)}
      >
        All
      </Link>
      {categories.map((category) => {
        const selected = active === category.slug;
        return (
          <Link
            key={category.slug}
            href={`${SHOP_PATH}?category=${category.slug}` as never}
            aria-current={selected ? 'page' : undefined}
            className={item(selected)}
          >
            {category.name}
          </Link>
        );
      })}
    </nav>
  );
}
