import { AlertTriangle } from 'lucide-react';
import { formatMoney } from '@/lib/money';

/**
 * Says so when gross profit is not fully costed.
 *
 * A sale with no recorded cost of goods has an unknown profit, but subtracting zero from its revenue
 * makes the whole amount look like profit. Rather than show that as fact, say how much revenue it
 * covers. Renders nothing when every sale in the period carries a cost.
 */
export function UncostedNote({
  sales,
  revenueCents,
  className,
}: {
  sales: number;
  revenueCents: number;
  className?: string;
}) {
  if (sales <= 0) return null;
  return (
    <p
      role="note"
      className={`flex items-start gap-2 rounded-row bg-warning-muted px-3 py-2 text-[12px] text-ink-2 leading-snug ${className ?? ''}`}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
      <span>
        {sales === 1 ? '1 sale has' : `${sales} sales have`} no recorded cost (
        {formatMoney(revenueCents)} revenue), so gross profit counts{' '}
        {sales === 1 ? 'it' : 'them'} as pure profit. It is a ceiling, not a final figure.
      </span>
    </p>
  );
}
