import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The stacked alternative to a `<Table>`, for the tables with too many
 * columns to stay legible once they have to scroll horizontally on a phone.
 *
 * Convention: a page renders both, one hidden by the breakpoint —
 *
 * ```tsx
 * <div className="hidden lg:block"><TableWrap><Table>…</Table></TableWrap></div>
 * <MobileList>{rows.map((row) => <MobileRow key={row.id}>…</MobileRow>)}</MobileList>
 * ```
 *
 * `lg` rather than `sm`/`md`: these tables commonly carry seven or more
 * columns, and a tablet-width table of that shape is still a table nobody
 * can read without scrolling sideways.
 */
export function MobileList({ className, ...props }: ComponentProps<'ul'>) {
  return <ul className={cn('divide-y divide-line-subtle lg:hidden', className)} {...props} />;
}

export function MobileRow({
  className,
  interactive = true,
  ...props
}: ComponentProps<'li'> & { interactive?: boolean }) {
  return (
    <li
      className={cn(
        // `relative` + a stretched first link: the whole row is the tap target, "..." sits above it.
        'relative flex flex-col gap-2 px-4 py-3 text-[13px]',
        '[&>a:first-child]:after:absolute [&>a:first-child]:after:inset-0',
        // Leave room in the header for the actions button when the row has one.
        '[&:has([data-row-actions])_[data-row-header]]:pr-10',
        interactive && 'transition-colors active:bg-hover',
        className,
      )}
      {...props}
    />
  );
}

/** The row's "..." menu or its one quick action, pinned to the top-right corner (a 44px target)
 *  instead of costing a line of its own. Place it as a direct child of `MobileRow`, after the link.
 *  `wide` is for actions with a text label (an "Adjust" or "Attach receipt" button): they would
 *  cover the header, so they keep a line of their own at the foot of the row. */
export function MobileRowActions({
  className,
  wide,
  ...props
}: ComponentProps<'div'> & { wide?: boolean }) {
  return (
    <div
      {...(wide ? {} : { 'data-row-actions': '' })}
      className={cn(
        wide
          ? 'relative z-[1] flex items-center justify-end gap-1'
          : 'absolute top-1 right-1 z-[1] flex min-h-11 items-center justify-end',
        className,
      )}
      {...props}
    />
  );
}

/** The row's headline — what the desktop table's first column carries —
 *  paired with whatever belongs at the right edge: a status badge, a price,
 *  an actions menu. */
export function MobileRowHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-row-header=""
      className={cn('flex items-start justify-between gap-3', className)}
      {...props}
    />
  );
}

/** The row's supporting facts as label/value pairs, two per line — a SKU
 *  next to a quantity next to a date reads as a receipt, not a run-on
 *  sentence the way cramming them into one line of text would. */
export function MobileRowMeta({ className, ...props }: ComponentProps<'dl'>) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]', className)} {...props} />
  );
}

export function MobileRowMetaItem({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10px] text-ink-4 uppercase tracking-[0.06em]">{label}</dt>
      <dd className="truncate text-ink-2">{children}</dd>
    </div>
  );
}
