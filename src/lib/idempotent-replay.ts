/**
 * When is a repeated submit really "the same submit"?
 *
 * A form sends one idempotency key for the life of the page. A double click or
 * a network retry carries the same key and the same content, and should get the
 * first result back. But the key can also outlive its purpose: with the route
 * kept alive in the back/forward cache, Back to the form restores the old key,
 * and a *different* sale (or "Record" after "Save draft") would silently be
 * answered with the earlier document and book nothing.
 *
 * So a key hit only counts as a replay when what is stored matches what was
 * asked for. Anything else is refused out loud.
 */

export type ReplayLine = {
  /** The bundle id when the line is a bundle, otherwise the variant id. */
  ref: string;
  quantity: number;
  unitPriceCents: number;
};

export type ReplayDocument = {
  /** Draft or confirmed. Omit where the status moves on after creation. */
  status?: string;
  currency: string;
  customerId?: string | null;
  discountCents?: number;
  lines: ReplayLine[];
};

function fingerprint(doc: ReplayDocument): string {
  const lines = doc.lines
    .map((line) => `${line.ref}:${line.quantity}:${line.unitPriceCents}`)
    .sort()
    .join('|');
  return [
    doc.status ?? '',
    doc.currency,
    doc.customerId ?? '',
    doc.discountCents ?? 0,
    lines,
  ].join('#');
}

export function isSameSubmission(stored: ReplayDocument, requested: ReplayDocument): boolean {
  return fingerprint(stored) === fingerprint(requested);
}

export function alreadySubmittedMessage(noun: 'sale' | 'order'): string {
  return `This form was already submitted. Reload to record another ${noun}.`;
}
