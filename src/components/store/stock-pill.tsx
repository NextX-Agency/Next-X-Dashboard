import { cn } from '@/lib/cn';

/** A product is "last pieces" at or below this many units. */
export const LOW_STOCK_AT = 2;

/**
 * Stock in plain language. Counts are shown only when they are low, because "Only 2 left" is genuinely
 * useful and "40 left" is just noise (and a number the shop may not want to publish).
 */
export function StockPill({
  onHand,
  incoming = 0,
  className,
}: {
  onHand: number;
  incoming?: number;
  className?: string;
}) {
  const out = onHand <= 0;
  const low = !out && onHand <= LOW_STOCK_AT;
  const label = out
    ? incoming > 0
      ? 'On the way'
      : 'Sold out'
    : low
      ? `Only ${onHand} left`
      : 'In stock';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold text-[12px]',
        out && 'bg-sunken text-ink-3',
        low && 'bg-accent-muted text-accent',
        !out && !low && 'bg-positive-muted text-positive',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          out && 'bg-ink-4',
          low && 'bg-store-bright',
          !out && !low && 'bg-positive',
        )}
      />
      {label}
    </span>
  );
}
