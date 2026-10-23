import type { RateMicros } from '@/lib/fx';
import { fromBase } from '@/lib/fx';
import { type CurrencyCode, formatMoney } from '@/lib/money';
import { type StoreCartLine, storeCartSubtotal } from '@/lib/store-cart';
import { formatPickupDate, formatSrd } from '@/lib/store-money';

/**
 * The text of every WhatsApp message the shop prepares. Kept here, away from the components, so the
 * wording is reviewed in one place and the tests assert on the real strings. The messages are plain
 * text with no emoji: they survive URL encoding and every WhatsApp client unchanged. They state what
 * the website showed and ask the shop to confirm; they never claim a reservation, a delivery date or a
 * final price, because none of those exist until the shop confirms the order.
 */

/** A single-variant product carries a placeholder variant name; it tells a customer nothing. */
export function variantLabel(name: string): string | null {
  const trimmed = name.trim();
  return trimmed && !/^(default|standaard|standard|std)$/i.test(trimmed) ? trimmed : null;
}

/** A price as the customer sees it: SRD first, with the USD amount beside it when it is the base price. */
export function customerMoney(
  amountCents: number,
  currency: CurrencyCode,
  srdRate?: RateMicros,
): string {
  if (currency === 'USD' && srdRate && srdRate > 0) {
    return `${formatSrd(fromBase(amountCents, srdRate))} (${formatMoney(amountCents, 'USD')})`;
  }
  return currency === 'SRD' ? formatSrd(amountCents) : formatMoney(amountCents, currency);
}

export function enquiryMessage(businessName: string): string {
  return `Hello ${businessName}, I have a question.`;
}

export function assortmentMessage(businessName: string): string {
  return `Hello ${businessName}, I have a question about your products.`;
}

export function shareExperienceMessage(businessName: string): string {
  return `Hello ${businessName}, I'd like to share my experience.`;
}

export function productOrderMessage(input: {
  businessName: string;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  price: string;
}): string {
  const variant = input.variantName ? ` – ${input.variantName}` : '';
  const sku = input.sku ? ` (SKU ${input.sku})` : '';
  return `Hello ${input.businessName}, I'd like to order the ${input.productName}${variant}${sku}. The website lists it at ${input.price}. Could you confirm it is available?`;
}

export function productRestockMessage(input: {
  businessName: string;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  price: string;
}): string {
  const variant = input.variantName ? ` – ${input.variantName}` : '';
  const sku = input.sku ? ` (SKU ${input.sku})` : '';
  return `Hello ${input.businessName}, could you tell me when the ${input.productName}${variant}${sku} will be back in stock? The website lists it at ${input.price}.`;
}

export function setMessage(input: {
  businessName: string;
  setName: string;
  inStock: boolean;
}): string {
  return input.inStock
    ? `Hello ${input.businessName}, I'd like to order the ${input.setName} set.`
    : `Hello ${input.businessName}, I'd like to know more about the ${input.setName} set.`;
}

export type CartMessageInput = {
  businessName: string;
  lines: StoreCartLine[];
  srdRate?: RateMicros;
  customerName?: string;
  customerPhone?: string;
  pickupLocation: string;
  /** `YYYY-MM-DD` */
  pickupDate: string;
  notes?: string;
};

/** A single-line field: any line break a pasted value carries becomes a space. */
function oneLine(value: string | undefined, maxLength: number): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** The whole cart as one message. Subtotals are per currency; currencies are never added together. */
export function cartOrderMessage(input: CartMessageInput): string {
  const { lines, srdRate } = input;
  const currencies = [...new Set(lines.map((line) => line.currency))];
  // The form limits these, and so do we: a customer's text must not be able to pass for a line of the order.
  const name = oneLine(input.customerName, 120);
  const phone = oneLine(input.customerPhone, 40);
  const notes = input.notes?.trim().slice(0, 500);
  return [
    `Hello ${input.businessName}, I'd like to order the following items:`,
    '',
    ...lines.flatMap((line, index) => {
      const variant = variantLabel(line.variantName);
      return [
        `${index + 1}. ${line.productName}${variant ? ` – ${variant}` : ''}${line.sku ? ` (SKU ${line.sku})` : ''}`,
        `   ${line.quantity} × ${customerMoney(line.priceCents, line.currency, srdRate)} = ${customerMoney(storeCartSubtotal([line], line.currency), line.currency, srdRate)}`,
      ];
    }),
    '',
    ...currencies.map(
      (currency) =>
        `Estimated total: ${customerMoney(storeCartSubtotal(lines, currency), currency, srdRate)}`,
    ),
    '',
    ...(name ? [`Name: ${name}`] : []),
    ...(phone ? [`Phone: ${phone}`] : []),
    `Pickup location: ${input.pickupLocation}`,
    `Preferred pickup date: ${formatPickupDate(input.pickupDate)}`,
    // Later lines of a note are indented under it.
    ...(notes ? [`Notes: ${notes.replace(/\s*\r?\n\s*/g, '\n   ')}`] : []),
    '',
    'Please confirm current stock and the final price.',
    'Stock is only reserved once the shop confirms my order.',
  ].join('\n');
}
