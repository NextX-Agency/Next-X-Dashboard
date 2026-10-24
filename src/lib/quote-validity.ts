export type PublicQuoteState = 'hidden' | 'expired' | 'open';

/**
 * What a customer holding a quote link may see.
 *
 * A void quote does not exist for them. A quote past its "valid until" moment is
 * shown as expired, with no prices: nothing marks quotes 'expired' in the
 * database, so the date itself has to decide.
 */
export function publicQuoteState(
  quote: { status: string; validUntil: Date | string | null },
  now: Date = new Date(),
): PublicQuoteState {
  if (quote.status === 'void') return 'hidden';
  if (quote.status === 'expired') return 'expired';
  if (quote.validUntil === null) return 'open';
  const until = new Date(quote.validUntil).getTime();
  if (Number.isNaN(until)) return 'open';
  return until < now.getTime() ? 'expired' : 'open';
}
