import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Page links for a list, rendered server-side — no client state, no
 * JavaScript required to page through a table. `buildHref` takes a page
 * number and returns the full URL, so the caller decides which other
 * params (search, filters, sort) travel along.
 */
export function Pagination({
  page,
  pageCount,
  total,
  perPage,
  buildHref,
}: {
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
  buildHref: (page: number) => Route;
}) {
  if (total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-2 border-line-subtle border-t px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <p className="text-[12px] text-ink-4 max-sm:text-center">
        Showing <span className="tabular text-ink-3">{from}</span>–
        <span className="tabular text-ink-3">{to}</span> of{' '}
        <span className="tabular text-ink-3">{total}</span>
      </p>

      {pageCount > 1 ? (
        <div className="flex items-center gap-2 sm:gap-1">
          <PageLink
            href={buildHref(page - 1)}
            disabled={page <= 1}
            label="Previous page"
            text="Previous"
            Icon={ChevronLeft}
          />
          <span className="tabular px-2 text-[12px] text-ink-3 max-sm:order-none">
            {page} / {pageCount}
          </span>
          <PageLink
            href={buildHref(page + 1)}
            disabled={page >= pageCount}
            label="Next page"
            text="Next"
            Icon={ChevronRight}
            after
          />
        </div>
      ) : null}
    </nav>
  );
}

/** A previous/next link: a 44px labelled button on a phone, the small chevron from `sm`. */
function PageLink({
  href,
  disabled,
  label,
  text,
  Icon,
  after,
}: {
  href: Route;
  disabled: boolean;
  label: string;
  text: string;
  Icon: typeof ChevronLeft;
  after?: boolean;
}) {
  const content = (
    <>
      {after ? <span className="sm:hidden">{text}</span> : null}
      <Icon aria-hidden="true" className="size-4 sm:size-3.5" />
      {after ? null : <span className="sm:hidden">{text}</span>}
    </>
  );
  const shape =
    'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-control border text-[14px] sm:size-7 sm:flex-none sm:border-0 sm:text-[12px]';
  if (disabled) {
    return (
      <span
        aria-hidden
        className={cn(shape, 'border-line-subtle text-ink-4/50 sm:text-ink-4/40')}
      >
        {content}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        shape,
        'border-line bg-raised font-medium text-ink-2 transition-colors',
        'hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:bg-transparent sm:font-normal sm:text-ink-3',
      )}
    >
      {content}
    </Link>
  );
}
