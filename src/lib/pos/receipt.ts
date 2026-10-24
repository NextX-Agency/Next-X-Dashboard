import type { Cents, CurrencyCode } from '@/lib/money';
import { normalisePhone } from '@/lib/settings-fields';
import { formatPos } from './format';

/**
 * The text receipt sent over WhatsApp.
 *
 * Plain text with no emoji and no tables: it survives URL encoding and every WhatsApp client. It
 * states what was recorded (items, total, what was paid, what is still owed) and nothing the books do
 * not say. Kept here, away from the components, so the wording is reviewed in one place and the tests
 * assert on the real string.
 */

export type ReceiptLine = {
  name: string;
  option?: string | null;
  quantity: number;
  unitCents: Cents;
  lineCents: Cents;
};

export type ReceiptInput = {
  businessName: string;
  number: string;
  /** Already formatted for reading, e.g. "24 Oct 2026". */
  dateLabel: string;
  currency: CurrencyCode;
  lines: ReceiptLine[];
  discountCents: Cents;
  totalCents: Cents;
  paidCents: Cents;
  /** Cash handed back, when there was any. */
  changeCents?: Cents;
  /** How it was paid, e.g. "Cash". */
  paidWith?: string | null;
  customerName?: string | null;
  /** The shared invoice link, when one was created. */
  invoiceUrl?: string | null;
  footer?: string | null;
};

export function buildReceiptText(receipt: ReceiptInput): string {
  const money = (cents: Cents) => formatPos(cents, receipt.currency);
  const balance = Math.max(0, receipt.totalCents - receipt.paidCents);
  const rows: string[] = [
    `${receipt.businessName} - Receipt ${receipt.number}`,
    receipt.dateLabel,
  ];
  if (receipt.customerName) rows.push(`Customer: ${receipt.customerName}`);
  rows.push('');
  for (const line of receipt.lines) {
    const label = line.option ? `${line.name} (${line.option})` : line.name;
    rows.push(
      line.quantity === 1
        ? `${label}: ${money(line.lineCents)}`
        : `${line.quantity} x ${label} @ ${money(line.unitCents)}: ${money(line.lineCents)}`,
    );
  }
  rows.push('');
  if (receipt.discountCents > 0) rows.push(`Discount: -${money(receipt.discountCents)}`);
  rows.push(`Total: ${money(receipt.totalCents)}`);
  rows.push(
    `Paid: ${money(receipt.paidCents)}${receipt.paidWith ? ` (${receipt.paidWith})` : ''}`,
  );
  if (receipt.changeCents && receipt.changeCents > 0) {
    rows.push(`Change: ${money(receipt.changeCents)}`);
  }
  rows.push(balance > 0 ? `Balance to pay: ${money(balance)}` : 'Balance: 0 - paid in full');
  if (receipt.invoiceUrl) rows.push('', `Invoice: ${receipt.invoiceUrl}`);
  rows.push('', receipt.footer?.trim() || 'Thank you!');
  return rows.join('\n');
}

/** International digits for a customer's phone, or null when it cannot be a WhatsApp number. */
export function whatsappDigitsForPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalised = normalisePhone(phone);
  return normalised ? normalised.replace(/\D/g, '') : null;
}

/**
 * A wa.me link with the receipt filled in. To the customer's number when it is known; otherwise the
 * bare share link, which opens WhatsApp's own contact picker.
 */
export function receiptWhatsappUrl(text: string, phone?: string | null): string {
  const digits = whatsappDigitsForPhone(phone);
  return `https://wa.me/${digits ?? ''}?text=${encodeURIComponent(text)}`;
}
