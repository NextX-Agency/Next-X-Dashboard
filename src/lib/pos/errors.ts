/**
 * Refusals from the sale action, said so a cashier knows what to do.
 *
 * The server already writes its refusals in words (stock reserved for orders, a wallet in the wrong
 * currency, no exchange rate). This only recognises them so the screen can add the right next step
 * and offer the one override the owner has; anything else is passed through as written.
 */
export type SaleErrorKind =
  | 'reserved'
  | 'rate'
  | 'wallet'
  | 'duplicate'
  | 'unavailable'
  | 'offline'
  | 'other';

export type SaleError = { kind: SaleErrorKind; message: string; hint: string | null };

export function describeSaleError(message: string | undefined | null): SaleError {
  const text = (message ?? '').trim();
  if (!text) {
    return {
      kind: 'other',
      message: 'The sale could not be recorded.',
      hint: 'Check your connection and try again.',
    };
  }
  if (text.startsWith('This sale would use stock reserved')) {
    return {
      kind: 'reserved',
      message: text,
      hint: 'Lower the quantity, or ask the owner to sell it anyway.',
    };
  }
  if (text.startsWith('No exchange rate has been set')) {
    return {
      kind: 'rate',
      message: 'There is no exchange rate yet, so a sale in SRD cannot be recorded.',
      hint: 'Sell in USD, or ask the owner to add a rate under Exchange rates.',
    };
  }
  if (/holds (USD|SRD), but this sale is in/.test(text) || text.includes('is inactive.')) {
    return {
      kind: 'wallet',
      message: text,
      hint: 'Pick a wallet in the same currency as the sale.',
    };
  }
  if (text.includes('already submitted')) {
    return {
      kind: 'duplicate',
      message: 'This cart was already recorded or changed after a first attempt.',
      hint: 'Open Today to check whether the sale went through before charging again.',
    };
  }
  if (text.includes('archived') || text.includes('active product variant')) {
    return {
      kind: 'unavailable',
      message: 'An item in the cart is no longer sold.',
      hint: 'Remove it and try again.',
    };
  }
  return { kind: 'other', message: text, hint: null };
}
