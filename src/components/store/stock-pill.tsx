import { cn } from '@/lib/cn';

/**
 * Kept only because other files still import it. The shop no longer shows "Last pieces" or
 * "Only n left": available is the normal state and says nothing.
 */
export const LOW_STOCK_AT = 2;

/** The one stock label worth showing. `null` means available, which needs no label. */
export function stockLabel(onHand: number, incoming = 0): 'Sold out' | 'On the way' | null {
  if (onHand > 0) return null;
  return incoming > 0 ? 'On the way' : 'Sold out';
}

/**
 * Stock status as plain text, and only when it is informative: "Sold out", or "On the way" when a
 * restock is incoming. Available products show nothing. No counts, no urgency, no coloured dot, so the
 * state is carried by the words and never by colour alone.
 */
export function StockNote({
  onHand,
  incoming = 0,
  className,
}: {
  onHand: number;
  incoming?: number;
  className?: string;
}) {
  const label = stockLabel(onHand, incoming);
  if (!label) return null;
  return <span className={cn('font-semibold text-[13px] text-ink-2', className)}>{label}</span>;
}

export { StockNote as StockPill };
