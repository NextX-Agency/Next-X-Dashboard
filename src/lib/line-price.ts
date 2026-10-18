import { fromBase, type RateMicros } from './fx';
import { type Cents, type CurrencyCode, toDecimalString } from './money';

/**
 * The price a sale or order line starts from: the variant's list price (kept in USD) shown in the
 * document's own currency. An SRD document converts at the rate in force; a USD one passes through.
 * The server still validates and converts what is submitted; this only fills the field.
 */
export function defaultUnitPrice(
  listPriceCents: Cents,
  currency: CurrencyCode,
  rateMicros: RateMicros,
): string {
  return toDecimalString(
    currency === 'SRD' ? fromBase(listPriceCents, rateMicros) : listPriceCents,
  );
}
