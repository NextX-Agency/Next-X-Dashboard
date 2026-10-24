import { type Cents, type CurrencyCode, formatMoney } from '@/lib/money';
import { formatSrd } from '@/lib/store-money';

/**
 * Money as the counter writes it. SRD always carries its code and drops the cents when there are
 * none ("SRD 1,850"), USD keeps two decimals ("$29.55"), so an SRD amount never reads as dollars.
 */
export function formatPos(cents: Cents, currency: CurrencyCode): string {
  if (currency === 'SRD') {
    return cents < 0 ? `-${formatSrd(-cents)}` : formatSrd(cents);
  }
  return formatMoney(cents, 'USD');
}
