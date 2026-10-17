import { cn } from '@/lib/cn';
import { fromBase, type RateMicros, toBase } from '@/lib/fx';
import { type Cents, formatMoney } from '@/lib/money';

/**
 * A storefront price. SRD leads (customers pay in SRD) and is always written
 * with its code, `SRD 4.850`, never a bare `$` that could be read as USD. When a
 * rate is configured the USD figure follows as a quiet indication.
 */
const sizes = {
  sm: { primary: 'text-[15px]', secondary: 'text-[11px]' },
  md: { primary: 'text-[17px]', secondary: 'text-[12px]' },
  lg: { primary: 'text-[24px]', secondary: 'text-[13px]' },
  xl: { primary: 'text-[34px]', secondary: 'text-[14px]' },
} as const;

const srdFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const srdFormatterCents = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `SRD 4.850`, or `SRD 4.850,50` when there are cents. */
export function formatSrd(cents: Cents): string {
  const units = cents / 100;
  return `SRD ${cents % 100 === 0 ? srdFormatter.format(units) : srdFormatterCents.format(units)}`;
}

export function StorePrice({
  usdCents,
  amountCents,
  currency = 'USD',
  srdRate,
  size = 'lg',
  prefix,
  tone = 'default',
  className,
}: {
  /** Legacy prop kept for bundles and older callers; new storefront prices
   * should pass amountCents + currency from the assigned price list. */
  usdCents?: Cents;
  amountCents?: Cents;
  currency?: 'USD' | 'SRD';
  srdRate?: RateMicros;
  size?: keyof typeof sizes;
  /** e.g. "vanaf" for a product whose variants span a price range. */
  prefix?: string;
  tone?: 'default' | 'night';
  className?: string;
}) {
  const amount = amountCents ?? usdCents ?? 0;
  const hasSrd = Boolean(srdRate && srdRate > 0);
  const usdCentsValue =
    currency === 'SRD' && srdRate && srdRate > 0 ? toBase(amount, srdRate) : amount;
  const srdCents =
    hasSrd && currency === 'USD' ? fromBase(amount, srdRate as RateMicros) : amount;
  const headlineIsSrd = currency === 'SRD' || hasSrd;
  const night = tone === 'night';

  return (
    <span className={cn('flex flex-col items-start leading-none', className)}>
      <span className="flex items-baseline gap-1.5">
        {prefix ? (
          <span className={cn('text-[12px]', night ? 'text-night-ink-2' : 'text-ink-3')}>
            {prefix}
          </span>
        ) : null}
        <span
          className={cn(
            'tabular font-semibold tracking-[-0.02em]',
            night ? 'text-night-ink' : 'text-ink',
            sizes[size].primary,
          )}
        >
          {headlineIsSrd ? formatSrd(srdCents) : formatMoney(amount, 'USD')}
        </span>
      </span>
      {hasSrd ? (
        <span
          className={cn(
            'tabular mt-1.5',
            night ? 'text-night-ink-2' : 'text-ink-3',
            sizes[size].secondary,
          )}
        >
          ≈ {formatMoney(usdCentsValue, 'USD')}
        </span>
      ) : null}
    </span>
  );
}
