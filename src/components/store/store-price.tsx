import { cn } from '@/lib/cn';
import { fromBase, type RateMicros, toBase } from '@/lib/fx';
import { type Cents, formatMoney } from '@/lib/money';
import { formatSrd } from '@/lib/store-money';

/**
 * A storefront price. SRD leads (customers pay in SRD) and is always written with its code,
 * `SRD 4,850`, never a bare `$` that could be read as USD. When a rate is configured the USD figure
 * follows as a quiet indication. The price is the largest thing on a card.
 */
const sizes = {
  sm: { primary: 'text-[15px]', secondary: 'text-[11px]' },
  card: { primary: 'text-[22px]', secondary: 'text-[12px]' },
  md: { primary: 'text-[18px]', secondary: 'text-[12px]' },
  lg: { primary: 'text-[26px]', secondary: 'text-[13px]' },
  xl: { primary: 'text-[40px]', secondary: 'text-[14px]' },
} as const;

export { formatSrd };

export function StorePrice({
  usdCents,
  amountCents,
  currency = 'USD',
  srdRate,
  size = 'lg',
  prefix,
  className,
}: {
  /** Legacy prop kept for bundles and older callers; new storefront prices
   * should pass amountCents + currency from the assigned price list. */
  usdCents?: Cents;
  amountCents?: Cents;
  currency?: 'USD' | 'SRD';
  srdRate?: RateMicros;
  size?: keyof typeof sizes;
  /** e.g. "from" for a product whose variants span a price range. */
  prefix?: string;
  className?: string;
}) {
  const amount = amountCents ?? usdCents ?? 0;
  const hasSrd = Boolean(srdRate && srdRate > 0);
  const usdCentsValue =
    currency === 'SRD' && srdRate && srdRate > 0 ? toBase(amount, srdRate) : amount;
  const srdCents =
    hasSrd && currency === 'USD' ? fromBase(amount, srdRate as RateMicros) : amount;
  const headlineIsSrd = currency === 'SRD' || hasSrd;

  return (
    <span className={cn('flex flex-col items-start leading-none', className)}>
      <span className="flex items-baseline gap-1.5">
        {prefix ? <span className="text-[12px] text-ink-3">{prefix}</span> : null}
        <span
          className={cn(
            'tabular font-extrabold tracking-[-0.03em] text-ink',
            sizes[size].primary,
          )}
        >
          {headlineIsSrd ? formatSrd(srdCents) : formatMoney(amount, 'USD')}
        </span>
      </span>
      {hasSrd ? (
        <span className={cn('tabular mt-1.5 text-ink-3', sizes[size].secondary)}>
          ≈ {formatMoney(usdCentsValue, 'USD')}
        </span>
      ) : null}
    </span>
  );
}
