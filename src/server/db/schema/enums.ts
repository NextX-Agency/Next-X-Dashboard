import { pgEnum } from 'drizzle-orm/pg-core';

export const memberRole = pgEnum('member_role', ['owner', 'staff', 'viewer']);

export const currencyCode = pgEnum('currency_code', ['USD', 'SRD']);

export const storefrontStatus = pgEnum('storefront_status', ['draft', 'active', 'inactive']);

export const paymentMethod = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'card',
  'other',
]);

export const paymentStatus = pgEnum('payment_status', ['confirmed', 'voided']);

/** Origin is metadata, not a separate order system. Every channel creates the
 * same canonical order represented by the existing sales table. */
export const orderSource = pgEnum('order_source', [
  'manual',
  'pos',
  'web',
  'whatsapp',
  'messenger',
]);

export const orderStatus = pgEnum('order_status', [
  'draft',
  'confirmed',
  'ready',
  'completed',
  'cancelled',
]);

export const fulfillmentType = pgEnum('fulfillment_type', ['pickup', 'delivery']);
export const fulfillmentStatus = pgEnum('fulfillment_status', [
  'pending',
  'ready',
  'fulfilled',
  'cancelled',
]);
export const reservationStatus = pgEnum('reservation_status', [
  'active',
  'released',
  'consumed',
]);

export const supplierKind = pgEnum('supplier_kind', ['amazon', 'aliexpress', 'other']);

export const productStatus = pgEnum('product_status', ['draft', 'active', 'archived']);

export const purchaseOrderStatus = pgEnum('purchase_order_status', [
  'draft',
  'ordered',
  'shipped',
  'received',
  'cancelled',
]);

/** Every reason stock moves. The set is closed on purpose: an unexplained
 *  change in inventory should be impossible to record. */
export const movementKind = pgEnum('movement_kind', [
  'receipt',
  'sale',
  'return',
  'adjustment',
  'write_off',
]);

export const saleStatus = pgEnum('sale_status', ['draft', 'confirmed', 'void']);

export const quoteStatus = pgEnum('quote_status', [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'expired',
  'converted',
  'void',
]);

/** Where a storefront quote request (F-5) stands. `converted` means an owner
 *  turned it into a draft sale — the request stays as the record of where the
 *  sale came from. There is no `quoted` state on purpose: until prices leave
 *  this app (invoice, WhatsApp reply), the only real events are answering,
 *  turning down, and selling. */
export const quoteRequestStatus = pgEnum('quote_request_status', [
  'new',
  'contacted',
  'converted',
  'declined',
  'archived',
]);

export const ledgerDirection = pgEnum('ledger_direction', ['in', 'out']);

export const ledgerCategory = pgEnum('ledger_category', [
  'owner_contribution',
  'owner_draw',
  'sales_receipt',
  'purchase',
  'shipping',
  'operating',
  'refund',
  'other',
]);

export const recurringExpenseCadence = pgEnum('recurring_expense_cadence', [
  'monthly',
  'weekly',
  'quarterly',
  'yearly',
]);

export const commissionStatus = pgEnum('commission_status', ['open', 'paid', 'cancelled']);

/** What a ledger entry or stock movement points back at, so every posting can
 *  be traced to the document that caused it. */
export const documentKind = pgEnum('document_kind', [
  'purchase_order',
  'sale',
  'expense',
  'manual',
]);
