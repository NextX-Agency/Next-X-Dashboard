import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildMigrationPlan,
  deterministicUuid,
  hasFatalConflicts,
} from '../../scripts/migrate-nextx/transform';

const sanitized = JSON.parse(
  readFileSync(new URL('../fixtures/nextx-sanitized.json', import.meta.url), 'utf8'),
) as unknown;
const conflicts = JSON.parse(
  readFileSync(new URL('../fixtures/nextx-conflicts.json', import.meta.url), 'utf8'),
) as unknown;

describe('NextX migration planner', () => {
  it('generates stable UUIDs without using names or row order', () => {
    expect(deterministicUuid('nextx', 'items', 'item-1')).toBe(
      deterministicUuid('nextx', 'items', 'item-1'),
    );
    expect(deterministicUuid('nextx', 'items', 'item-1')).not.toBe(
      deterministicUuid('nextx', 'items', 'item-2'),
    );
  });

  it('keeps source checksums stable when only the export timestamp changes', () => {
    const first = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', exportedAt: '2026-09-23T12:00:00.000Z' },
      locations: [{ id: 'loc-1', name: 'Main' }],
    });
    const second = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', exportedAt: '2026-09-23T13:00:00.000Z' },
      locations: [{ id: 'loc-1', name: 'Main' }],
    });

    expect(first.sourceChecksum).toBe(second.sourceChecksum);
  });

  it('reuses the linked sale and exact sale line for a completed reservation', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          selling_price_usd: '10.00',
          selling_price_srd: '400.00',
        },
      ],
      exchangeRates: [{ id: 'rate-1', usd_to_srd: '40', set_at: '2026-01-01T00:00:00.000Z' }],
      sales: [
        {
          id: 'sale-1',
          location_id: 'loc-1',
          currency: 'SRD',
          total_amount: '800.00',
          status: 'completed',
        },
      ],
      saleItems: [
        {
          id: 'line-1',
          sale_id: 'sale-1',
          item_id: 'item-1',
          quantity: 2,
          unit_price: '400.00',
          subtotal: '800.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-1',
          item_id: 'item-1',
          location_id: 'loc-1',
          quantity: 2,
          status: 'completed',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-sale-1',
          event_type: 'sale',
          source_type: 'sale',
          source_id: 'sale-1',
          amount: '800.00',
          currency: 'SRD',
          direction: 'in',
          metadata: '{"reservationIds":["reservation-1"]}',
        },
      ],
    });

    const orders = plan.operations.filter((operation) => operation.table === 'sales');
    const saleLines = plan.operations.filter((operation) => operation.table === 'sale_items');
    const reservation = plan.operations.find(
      (operation) => operation.table === 'inventory_reservations',
    );

    expect(orders).toHaveLength(1);
    expect(saleLines).toHaveLength(1);
    expect(reservation?.values.order_id).toBe(orders[0]?.values.id);
    expect(reservation?.values.order_item_id).toBe(saleLines[0]?.values.id);
    expect(reservation?.values.status).toBe('consumed');
    expect(
      plan.conflicts.some(
        (conflict) =>
          conflict.kind === 'INVALID_CURRENCY' && conflict.entityType === 'reservations',
      ),
    ).toBe(false);
  });

  it('uses an exact completion activity invoice link for its named reservation', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: { activity_logs: '1' },
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          selling_price_usd: '10.00',
          selling_price_srd: '400.00',
        },
      ],
      sales: [
        {
          id: 'sale-audit',
          invoice_number: 'NX-RES-0001',
          location_id: 'loc-1',
          currency: 'USD',
          total_amount: '10.00',
          status: 'completed',
        },
      ],
      saleItems: [
        {
          id: 'line-audit',
          sale_id: 'sale-audit',
          item_id: 'item-1',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-audit',
          item_id: 'item-1',
          location_id: 'loc-1',
          quantity: 1,
          status: 'completed',
        },
      ],
      activityLogs: [
        {
          id: 'activity-audit',
          action: 'complete',
          entity_type: 'reservation',
          entity_id: 'reservation-audit',
          source: 'reservations-api',
          details: 'Completed 1 reservation item(s) as NX-RES-0001.',
        },
      ],
    });

    const orders = plan.operations.filter((operation) => operation.table === 'sales');
    const saleLines = plan.operations.filter((operation) => operation.table === 'sale_items');
    const reservation = plan.operations.find(
      (operation) => operation.table === 'inventory_reservations',
    );

    expect(orders).toHaveLength(1);
    expect(saleLines).toHaveLength(1);
    expect(reservation?.values.order_id).toBe(orders[0]?.values.id);
    expect(reservation?.values.order_item_id).toBe(saleLines[0]?.values.id);
    expect(reservation?.values.status).toBe('consumed');
    expect(
      plan.conflicts.some(
        (conflict) => conflict.kind === 'COMPLETED_RESERVATION_WITHOUT_SALE_LINK',
      ),
    ).toBe(false);
  });

  it('links a completed reservation to the sale created in the same source request', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: { activity_logs: '2' },
      },
      locations: [{ id: 'loc-request', name: 'Main' }],
      items: [{ id: 'item-request', name: 'Headphones', selling_price_usd: '10.00' }],
      sales: [
        {
          id: 'sale-request',
          location_id: 'loc-request',
          currency: 'USD',
          total_amount: '10.00',
          status: 'completed',
        },
      ],
      saleItems: [
        {
          id: 'line-request',
          sale_id: 'sale-request',
          item_id: 'item-request',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-request',
          item_id: 'item-request',
          location_id: 'loc-request',
          quantity: 1,
          status: 'completed',
        },
      ],
      activityLogs: [
        {
          id: 'sale-created-request',
          action: 'create',
          entity_type: 'sale',
          entity_id: 'sale-request',
          source: 'reservations-api',
          request_id: 'request-request',
        },
        {
          id: 'reservation-completed-request',
          action: 'complete',
          entity_type: 'reservation',
          entity_id: 'reservation-request',
          source: 'reservations-api',
          request_id: 'request-request',
        },
      ],
    });

    const orders = plan.operations.filter((operation) => operation.table === 'sales');
    const saleLines = plan.operations.filter((operation) => operation.table === 'sale_items');
    const reservation = plan.operations.find(
      (operation) => operation.table === 'inventory_reservations',
    );

    expect(reservation?.values.order_id).toBe(orders[0]?.values.id);
    expect(reservation?.values.order_item_id).toBe(saleLines[0]?.values.id);
    expect(
      plan.conflicts.some(
        (conflict) => conflict.kind === 'COMPLETED_RESERVATION_WITHOUT_SALE_LINK',
      ),
    ).toBe(false);
  });

  it('preserves cancelled reservation status and applies the source SRD default without inventing a price', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          selling_price_usd: '10.00',
          selling_price_srd: '400.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-cancelled',
          item_id: 'item-1',
          location_id: 'loc-1',
          quantity: 1,
          status: 'cancelled',
          combo_id: 'combo-1',
          combo_price: '500.00',
          original_price: '600.00',
        },
      ],
    });

    const order = plan.operations.find((operation) => operation.table === 'sales');
    const reservation = plan.operations.find(
      (operation) => operation.table === 'inventory_reservations',
    );
    const line = plan.operations.find((operation) => operation.table === 'sale_items');

    expect(order?.values).toMatchObject({
      status: 'confirmed',
      workflow_status: 'cancelled',
      currency: 'SRD',
      total_cents: '0',
    });
    expect(order?.values.notes).toContain('Legacy combo group combo-1');
    expect(order?.values.notes).toContain('group price SRD=500.00');
    expect(order?.values.notes).toContain('group original price SRD=600.00');
    expect(line?.values.unit_price_cents).toBe('0');
    expect(reservation?.values.status).toBe('released');
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'RESERVATION_WITHOUT_PRICE', severity: 'info' }),
    );
    expect(
      plan.conflicts.some(
        (conflict) =>
          conflict.kind === 'INVALID_CURRENCY' && conflict.entityType === 'reservations',
      ),
    ).toBe(false);
  });

  it('archives a completed reservation without a sale link instead of deriving a duplicate order', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          selling_price_usd: '10.00',
          selling_price_srd: '400.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-unlinked',
          item_id: 'item-1',
          location_id: 'loc-1',
          quantity: 1,
          status: 'completed',
        },
      ],
    });

    expect(plan.operations.filter((operation) => operation.table === 'sales')).toHaveLength(0);
    expect(
      plan.operations.filter((operation) => operation.table === 'inventory_reservations'),
    ).toHaveLength(0);
    const archived = plan.operations.filter(
      (operation) => operation.table === 'legacy_reservation_archive',
    );
    expect(archived).toHaveLength(1);
    expect(archived[0]?.values).toMatchObject({
      legacy_id: 'reservation-unlinked',
      legacy_item_id: 'item-1',
      quantity: 1,
    });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'COMPLETED_RESERVATION_ARCHIVED',
        severity: 'info',
        entityKey: 'reservation-unlinked',
      }),
    );
    expect(plan.conflicts.filter((conflict) => conflict.severity === 'fatal')).toHaveLength(0);
  });

  it('rejects ledger metadata that associates one reservation with multiple source sales', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          selling_price_usd: '10.00',
          selling_price_srd: '400.00',
        },
      ],
      sales: [
        {
          id: 'sale-1',
          location_id: 'loc-1',
          currency: 'USD',
          total_amount: '10.00',
          status: 'completed',
        },
        {
          id: 'sale-2',
          location_id: 'loc-1',
          currency: 'USD',
          total_amount: '10.00',
          status: 'completed',
        },
      ],
      saleItems: [
        {
          id: 'line-1',
          sale_id: 'sale-1',
          item_id: 'item-1',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
        {
          id: 'line-2',
          sale_id: 'sale-2',
          item_id: 'item-1',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
      reservations: [
        {
          id: 'reservation-ambiguous',
          item_id: 'item-1',
          location_id: 'loc-1',
          quantity: 1,
          status: 'completed',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-sale-1',
          event_type: 'sale',
          source_type: 'sale',
          source_id: 'sale-1',
          amount: '10.00',
          currency: 'USD',
          direction: 'in',
          metadata: { reservationIds: ['reservation-ambiguous'] },
        },
        {
          id: 'ledger-sale-2',
          event_type: 'sale',
          source_type: 'sale',
          source_id: 'sale-2',
          amount: '10.00',
          currency: 'USD',
          direction: 'in',
          metadata: { reservationIds: ['reservation-ambiguous'] },
        },
      ],
    });

    expect(plan.operations.filter((operation) => operation.table === 'sales')).toHaveLength(2);
    expect(
      plan.operations.filter((operation) => operation.table === 'inventory_reservations'),
    ).toHaveLength(0);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'AMBIGUOUS_RESERVATION_SALE_LINK',
        severity: 'fatal',
        entityKey: 'reservation-ambiguous',
      }),
    );
  });

  it('maps watch and audio rows into the shared Product/ProductVariant model', () => {
    const plan = buildMigrationPlan(sanitized);
    expect(plan.summary.operationRows.products).toBe(2);
    expect(plan.summary.operationRows.product_variants).toBe(2);
    expect(plan.summary.operationRows.storefronts).toBe(3);
    expect(plan.conflicts.some((conflict) => conflict.kind === 'DUPLICATE_SKU')).toBe(false);
    const categorySlugs = plan.operations
      .filter((operation) => operation.table === 'categories')
      .map((operation) => operation.values.slug);
    expect(categorySlugs).toHaveLength(new Set(categorySlugs).size);

    const audioVariant = plan.operations.find(
      (operation) =>
        operation.table === 'product_variants' && operation.sourceId === 'item-audio-1',
    );
    expect(audioVariant?.values.sku).toMatch(/^NX-/);
  });

  it('preserves legacy product review flags and reasons', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      items: [
        {
          id: 'item-review-1',
          name: 'Review fixture',
          selling_price_usd: '10.00',
          needs_review: true,
          review_reason: 'Product cost needs confirmation.',
        },
      ],
    });

    const product = plan.operations.find((operation) => operation.table === 'products');
    expect(product?.values.needs_review).toBe(true);
    expect(product?.values.review_reason).toBe('Product cost needs confirmation.');
  });

  it('rounds sub-cent catalog prices explicitly and archives their exact source decimals', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      items: [
        {
          id: 'item-subcent-price',
          name: 'Price precision fixture',
          selling_price_usd: '12.345',
          is_public: true,
        },
      ],
    });

    const price = plan.operations.find((operation) => operation.table === 'price_list_items');
    const archive = plan.operations.find(
      (operation) => operation.table === 'legacy_catalog_price_archive',
    );
    expect(price?.values.amount_cents).toBe('1235');
    expect(archive).toMatchObject({
      table: 'legacy_catalog_price_archive',
      values: {
        source_entity: 'items',
        legacy_id: 'item-subcent-price',
        currency: 'USD',
        source_amount: '12.345',
        rounded_source_cents: '1235',
        rounding_rule: 'ROUND_HALF_AWAY_FROM_ZERO_TO_MINOR_UNIT',
      },
    });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        kind: 'EXPECTED_CATALOG_PRICE_ROUNDING',
      }),
    );
    expect(
      plan.conflicts.some((conflict) => conflict.kind === 'UNSUPPORTED_MONEY_PRECISION'),
    ).toBe(false);
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('preserves unreconciled sale totals and flags the sale for explicit review', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        { id: 'item-1', name: 'Audio item', is_public: true, selling_price_usd: '10.00' },
      ],
      sales: [
        {
          id: 'sale-total-mismatch',
          location_id: 'loc-1',
          currency: 'USD',
          total_amount: '10.50',
          status: 'posted',
          needs_review: true,
          review_reason: 'A source review flag is present.',
        },
      ],
      saleItems: [
        {
          id: 'sale-line-1',
          sale_id: 'sale-total-mismatch',
          item_id: 'item-1',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
    });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        kind: 'ORDER_TOTAL_REVIEW_REQUIRED',
        entityKey: 'sale-total-mismatch',
        details: {
          sourceHeaderTotalCents: '1050',
          sourceLineSubtotalCents: '1000',
          sourceDiscountCents: '0',
          sourceLineCount: 1,
          sourceStatus: 'posted',
          sourceNeedsReview: true,
          sourceHasReviewReason: true,
          sourceHasNotes: false,
          sourceDiscountFieldPresent: false,
          customPriceLineCount: 0,
          discountReasonLineCount: 0,
          originalPriceDifferenceLineCount: 0,
        },
      }),
    );
    const sale = plan.operations.find(
      (operation) =>
        operation.table === 'sales' && operation.sourceId === 'sale-total-mismatch',
    );
    expect(sale?.values.total_cents).toBe('1050');
    expect(sale?.values.needs_review).toBe(true);
    expect(sale?.values.review_reason).toContain('A source review flag is present.');
    expect(sale?.values.review_reason).toContain('header=1050 USD cents');
    expect(sale?.values.review_reason).toContain('lineSubtotal=1000 cents');
    expect(
      plan.operations.find(
        (operation) =>
          operation.table === 'sale_items' && operation.sourceId === 'sale-total-mismatch:0',
      )?.values.line_total_cents,
    ).toBe('1000');
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('flags completed sales without a linked payment event for owner review', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-unpaid', name: 'Main' }],
      items: [{ id: 'item-unpaid', name: 'Audio item', selling_price_usd: '10.00' }],
      sales: [
        {
          id: 'sale-without-payment',
          location_id: 'loc-unpaid',
          currency: 'USD',
          total_amount: '10.00',
          status: 'posted',
        },
      ],
      saleItems: [
        {
          id: 'line-without-payment',
          sale_id: 'sale-without-payment',
          item_id: 'item-unpaid',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
    });

    const sale = plan.operations.find(
      (operation) =>
        operation.table === 'sales' && operation.sourceId === 'sale-without-payment',
    );
    expect(sale?.values.needs_review).toBe(true);
    expect(sale?.values.review_reason).toContain('no linked payment event');
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        kind: 'SALE_WITHOUT_PAYMENT_EVENT',
        entityKey: 'sale-without-payment',
      }),
    );
  });

  it('preserves a line-less legacy sale header and flags it for review', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-line-less', name: 'Main' }],
      sales: [
        {
          id: 'sale-line-less',
          location_id: 'loc-line-less',
          currency: 'USD',
          total_amount: '80.00',
          status: 'posted',
        },
      ],
    });

    const sale = plan.operations.find(
      (operation) => operation.table === 'sales' && operation.sourceId === 'sale-line-less',
    );
    expect(sale?.values.total_cents).toBe('8000');
    expect(sale?.values.needs_review).toBe(true);
    expect(sale?.values.review_reason).toContain('lineSubtotal=0 cents');
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        kind: 'ORDER_TOTAL_REVIEW_REQUIRED',
        entityKey: 'sale-line-less',
      }),
    );
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('preserves review flags and reasons on valid legacy sales', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-reviewed', name: 'Main' }],
      items: [{ id: 'item-reviewed', name: 'Reviewed item', selling_price_usd: '10.00' }],
      sales: [
        {
          id: 'sale-review-flag',
          location_id: 'loc-reviewed',
          currency: 'USD',
          total_amount: '10.00',
          status: 'posted',
          needs_review: true,
          review_reason: 'Manual source review requested.',
        },
      ],
      saleItems: [
        {
          id: 'sale-review-line',
          sale_id: 'sale-review-flag',
          item_id: 'item-reviewed',
          quantity: 1,
          unit_price: '10.00',
          subtotal: '10.00',
        },
      ],
      salePayments: [
        {
          id: 'payment-review-flag',
          sale_id: 'sale-review-flag',
          amount: '10.00',
          currency: 'USD',
        },
      ],
    });

    const sale = plan.operations.find(
      (operation) => operation.table === 'sales' && operation.sourceId === 'sale-review-flag',
    );
    expect(sale?.values.needs_review).toBe(true);
    expect(sale?.values.review_reason).toBe('Manual source review requested.');
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('imports a wallet transaction and its linked finance-ledger mirror once', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'wallet-1', person_name: 'Cash', type: 'cash', currency: 'USD', balance: '5.00' },
      ],
      walletTransactions: [
        {
          id: 'wallet-tx-1',
          wallet_id: 'wallet-1',
          type: 'adjustment',
          amount: '5.00',
          balance_before: '0.00',
          balance_after: '5.00',
          currency: 'USD',
          created_at: '2026-09-01T12:00:00.000Z',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-1',
          wallet_transaction_id: 'wallet-tx-1',
          wallet_id: 'wallet-1',
          event_type: 'wallet_adjustment',
          direction: 'in',
          amount: '5.00',
          currency: 'USD',
          occurred_at: '2026-09-01T12:00:00.000Z',
        },
      ],
    });

    const ledgerRows = plan.operations.filter(
      (operation) => operation.table === 'ledger_entries',
    );
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]?.values.direction).toBe('in');
    expect(
      plan.conflicts.some((conflict) => conflict.kind === 'WALLET_LEDGER_PAIR_MISMATCH'),
    ).toBe(false);
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('keeps refund cash movements in the ledger but flags missing order links', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'wallet-1', person_name: 'Cash', type: 'cash', currency: 'USD', balance: '0.00' },
      ],
      walletTransactions: [
        {
          id: 'refund-tx-1',
          wallet_id: 'wallet-1',
          type: 'debit',
          amount: '5.00',
          balance_before: '5.00',
          balance_after: '0.00',
          currency: 'USD',
          reference_type: 'sale_refund',
          reference_id: null,
        },
      ],
      financeLedgerEntries: [
        {
          id: 'refund-ledger-1',
          wallet_transaction_id: 'refund-tx-1',
          wallet_id: 'wallet-1',
          event_type: 'sale_refund',
          direction: 'out',
          amount: '5.00',
          currency: 'USD',
        },
      ],
    });

    expect(
      plan.operations.filter(
        (operation) =>
          operation.table === 'ledger_entries' && operation.sourceType === 'walletTransactions',
      ),
    ).toHaveLength(1);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        kind: 'UNLINKED_REFUND',
      }),
    );
    expect(
      plan.conflicts.some((conflict) => conflict.kind === 'WALLET_LEDGER_PAIR_MISMATCH'),
    ).toBe(false);
  });

  it('uses linked expense wallet events instead of synthesizing a duplicate posting', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'wallet-1', person_name: 'Cash', type: 'cash', currency: 'USD', balance: '5.00' },
      ],
      expenses: [
        {
          id: 'expense-1',
          amount: '5.00',
          currency: 'USD',
          wallet_id: 'wallet-1',
          category_name: 'Supplies',
          description: 'Office supplies',
          status: 'posted',
        },
      ],
      walletTransactions: [
        {
          id: 'wallet-tx-1',
          wallet_id: 'wallet-1',
          expense_id: 'expense-1',
          type: 'debit',
          amount: '5.00',
          balance_before: '10.00',
          balance_after: '5.00',
          currency: 'USD',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-1',
          wallet_transaction_id: 'wallet-tx-1',
          wallet_id: 'wallet-1',
          source_type: 'expense',
          source_id: 'expense-1',
          event_type: 'expense',
          direction: 'out',
          amount: '5.00',
          currency: 'USD',
        },
      ],
    });

    const expenseLedgerRows = plan.operations.filter(
      (operation) =>
        operation.table === 'ledger_entries' && operation.values.source_id === 'expense-1',
    );
    const expense = plan.operations.find(
      (operation) => operation.table === 'expenses' && operation.sourceId === 'expense-1',
    );
    expect(expenseLedgerRows).toHaveLength(1);
    expect(expenseLedgerRows[0]?.values.direction).toBe('out');
    expect(expense?.values.needs_review).toBe(false);
    expect(
      plan.conflicts.some((conflict) => conflict.kind === 'EXPENSE_WITHOUT_WALLET_MOVEMENT'),
    ).toBe(false);
  });

  it('flags expenses without a linked wallet movement for owner review', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        {
          id: 'wallet-unlinked-expense',
          person_name: 'Cash',
          type: 'cash',
          currency: 'USD',
          balance: '0.00',
        },
      ],
      expenses: [
        {
          id: 'expense-without-movement',
          amount: '45.00',
          currency: 'USD',
          wallet_id: 'wallet-unlinked-expense',
          description: 'Unlinked expense',
          status: 'posted',
        },
      ],
    });

    const expense = plan.operations.find(
      (operation) =>
        operation.table === 'expenses' && operation.sourceId === 'expense-without-movement',
    );
    expect(expense?.values.needs_review).toBe(true);
    expect(expense?.values.review_reason).toContain('no linked wallet movement');
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        kind: 'EXPENSE_WITHOUT_WALLET_MOVEMENT',
        entityKey: 'expense-without-movement',
      }),
    );
  });

  it('reports zero-value wallet transactions with no balance effect without creating ledger events', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'wallet-1', person_name: 'Cash', type: 'cash', currency: 'USD', balance: '0.00' },
      ],
      walletTransactions: [
        {
          id: 'wallet-zero-tx',
          wallet_id: 'wallet-1',
          type: 'adjustment',
          amount: '0.00',
          balance_before: '0.00',
          balance_after: '0.00',
          currency: 'USD',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-zero',
          wallet_transaction_id: 'wallet-zero-tx',
          wallet_id: 'wallet-1',
          direction: 'in',
          amount: '0.00',
          currency: 'USD',
        },
      ],
    });

    expect(
      plan.operations.filter((operation) => operation.table === 'ledger_entries'),
    ).toHaveLength(0);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        kind: 'ZERO_VALUE_WALLET_TRANSACTION',
        entityKey: 'wallet-zero-tx',
      }),
    );
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('rejects a zero-value wallet transaction that claims to change its balance', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'wallet-1', person_name: 'Cash', type: 'cash', currency: 'USD', balance: '0.00' },
      ],
      walletTransactions: [
        {
          id: 'wallet-zero-balance-change',
          wallet_id: 'wallet-1',
          type: 'adjustment',
          amount: '0.00',
          balance_before: '0.00',
          balance_after: '1.00',
          currency: 'USD',
        },
      ],
      financeLedgerEntries: [
        {
          id: 'ledger-zero-change',
          wallet_transaction_id: 'wallet-zero-balance-change',
          wallet_id: 'wallet-1',
          direction: 'in',
          amount: '0.00',
          currency: 'USD',
        },
      ],
    });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'fatal',
        kind: 'ZERO_AMOUNT_WALLET_BALANCE_CHANGE',
        entityKey: 'wallet-zero-balance-change',
      }),
    );
    expect(hasFatalConflicts(plan)).toBe(true);
  });

  it('maps legacy public combos to component-aware storefront bundles', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [
        { id: 'loc-1', name: 'Main' },
        { id: 'loc-2', name: 'Watches' },
      ],
      items: [
        {
          id: 'combo-1',
          name: 'Daily setup',
          is_combo: true,
          is_public: true,
          selling_price_usd: '40.00',
        },
        {
          id: 'item-1',
          name: 'Headphones',
          is_combo: false,
          is_public: true,
          selling_price_usd: '25.00',
          sku: 'HP-1',
        },
      ],
      comboItems: [{ id: 'combo-line-1', combo_id: 'combo-1', item_id: 'item-1', quantity: 2 }],
      stockTransfers: [
        {
          id: 'transfer-combo',
          item_id: 'combo-1',
          from_location_id: 'loc-1',
          to_location_id: 'loc-2',
          quantity: 1,
          created_at: '2026-08-01T10:00:00.000Z',
        },
      ],
      stock: [
        { id: 'stock-child', item_id: 'item-1', location_id: 'loc-1', quantity: 10 },
        { id: 'stock-combo', item_id: 'combo-1', location_id: 'loc-1', quantity: 5 },
      ],
      sales: [{ id: 'sale-1', currency: 'USD', totalAmount: '40.00', status: 'posted' }],
      saleItems: [
        {
          id: 'sale-line-1',
          saleId: 'sale-1',
          itemId: 'combo-1',
          quantity: 1,
          unitPrice: '40.00',
          subtotal: '40.00',
        },
      ],
    });

    expect(plan.summary.operationRows.products).toBe(1);
    expect(plan.summary.operationRows.product_variants).toBe(1);
    expect(plan.summary.operationRows.bundles).toBe(1);
    expect(plan.summary.operationRows.bundle_components).toBe(1);
    expect(plan.summary.operationRows.sale_items).toBe(1);
    expect(plan.summary.operationRows.inventory_movements).toBe(1);
    expect(hasFatalConflicts(plan)).toBe(false);

    const bundle = plan.operations.find((operation) => operation.table === 'bundles');
    const transfer = plan.operations.find(
      (operation) => operation.table === 'legacy_stock_transfer_archive',
    );
    const component = plan.operations.find(
      (operation) => operation.table === 'bundle_components',
    );
    const saleItem = plan.operations.find((operation) => operation.table === 'sale_items');
    expect(bundle?.values.name).toBe('Daily setup');
    expect(bundle?.values.price_cents).toBe('4000');
    expect(component?.values.quantity).toBe(2);
    expect(component?.values.product_name).toBe('Headphones');
    expect(saleItem?.values.bundle_id).toBe(bundle?.values.id);
    expect(saleItem?.values.variant_id).toBe(component?.values.variant_id);
    expect(transfer?.values.bundle_id).toBe(bundle?.values.id);
    expect(transfer?.values.variant_id).toBeNull();
    expect(plan.mappings).toContainEqual(
      expect.objectContaining({
        entityType: 'items',
        legacyId: 'combo-1',
        destinationEntity: 'bundles',
      }),
    );
    expect(plan.mappings).toContainEqual(
      expect.objectContaining({
        entityType: 'comboItems',
        legacyId: 'combo-line-1',
        destinationEntity: 'bundle_components',
      }),
    );
    expect(plan.mappings).toContainEqual(
      expect.objectContaining({
        entityType: 'stock',
        legacyId: 'stock-combo',
        destinationEntity: 'bundles',
        action: 'DERIVE',
      }),
    );
  });

  it('preserves legacy expense category ids and links source expenses to them', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      expenseCategories: [{ id: 'expense-category-1', name: 'Transport' }],
      expenses: [
        {
          id: 'expense-1',
          categoryId: 'expense-category-1',
          amount: '5.00',
          currency: 'USD',
          description: 'Fuel',
          receipt_number: 'NX-INV-204',
          vendor_name: 'Kwatta Fuel',
          classification: 'tax_fee',
          needs_review: true,
          review_reason: 'Legacy amount has more than two decimal places.',
          reviewed_at: '2026-02-02T00:00:00.000Z',
          reviewed_by_user_id: 'legacy-user-9',
        },
      ],
    });

    const category = plan.operations.find(
      (operation) => operation.table === 'expense_categories',
    );
    const expense = plan.operations.find((operation) => operation.table === 'expenses');
    expect(plan.summary.operationRows.expense_categories).toBe(1);
    expect(category?.values.name).toBe('Transport');
    expect(expense?.values.category_id).toBe(category?.values.id);
    expect(expense?.values.vendor_name).toBe('Kwatta Fuel');
    expect(expense?.values.classification).toBe('tax_fee');
    expect(expense?.values.needs_review).toBe(true);
    expect(expense?.values.review_reason).toContain(
      'Legacy amount has more than two decimal places.',
    );
    expect(expense?.values.reviewed_at).toBe('2026-02-02T00:00:00.000Z');
    expect(expense?.values.reviewed_by_legacy_id).toBe('legacy-user-9');
    expect(expense?.values.receipt_number).toBe('NX-INV-204');
    expect(plan.mappings).toContainEqual(
      expect.objectContaining({
        entityType: 'expenseCategories',
        legacyId: 'expense-category-1',
        destinationEntity: 'expense_categories',
      }),
    );
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('blocks unknown expense classifications rather than silently reclassifying them', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      expenses: [
        {
          id: 'expense-unknown-class',
          amount: '5.00',
          currency: 'USD',
          classification: 'capitalized_tooling',
        },
      ],
    });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        severity: 'fatal',
        kind: 'INVALID_EXPENSE_CLASSIFICATION',
        entityKey: 'expense-unknown-class',
      }),
    );
    expect(hasFatalConflicts(plan)).toBe(true);
  });

  it('maps recurring expense schedules and links their historical expense periods', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'location-1', name: 'Main' }],
      wallets: [
        { id: 'wallet-1', name: 'USD cash', type: 'cash', currency: 'USD', balance: '100.00' },
      ],
      expenseCategories: [{ id: 'category-1', name: 'Subscriptions' }],
      recurringExpenses: [
        {
          id: 'schedule-1',
          name: 'Software',
          vendor_name: 'Example Vendor',
          amount: '20.00',
          currency: 'USD',
          cadence: 'monthly',
          anchor_day: 31,
          wallet_id: 'wallet-1',
          location_id: 'location-1',
          category_id: 'category-1',
          next_run_on: '2026-10-31',
          is_active: true,
          auto_post: true,
          amount_is_estimated: true,
          anchor_day_is_estimated: false,
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          amount: '20.00',
          currency: 'USD',
          category_id: 'category-1',
          recurring_expense_id: 'schedule-1',
          period_key: '2026-09',
          description: 'Software',
        },
      ],
    });

    const schedule = plan.operations.find(
      (operation) => operation.table === 'recurring_expenses',
    );
    const expense = plan.operations.find((operation) => operation.table === 'expenses');
    expect(schedule?.values.amount_cents).toBe('2000');
    expect(schedule?.values.next_run_on).toBe('2026-10-31');
    expect(schedule?.values.amount_is_estimated).toBe(true);
    expect(expense?.values.recurring_expense_id).toBe(schedule?.values.id);
    expect(expense?.values.period_key).toBe('2026-09');
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('maps sellers, category precedence, historical commission amounts and paid flags', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'location-1', name: 'Main', commission_rate: '1.25' }],
      categories: [{ id: 'category-1', name: 'Audio', slug: 'audio' }],
      sellers: [
        {
          id: 'seller-1',
          name: 'Alex',
          location_id: 'location-1',
          commissionRate: '2.00',
        },
      ],
      seller_category_rates: [
        {
          id: 'seller-rate-1',
          seller_id: 'seller-1',
          category_id: 'category-1',
          commission_rate: '3.50',
        },
      ],
      items: [
        {
          id: 'item-1',
          name: 'Headphones',
          sku: 'HP-1',
          category_id: 'category-1',
          selling_price_usd: '40.00',
          is_public: true,
        },
      ],
      sales: [
        {
          id: 'sale-1',
          seller_id: 'seller-1',
          location_id: 'location-1',
          currency: 'USD',
          total_amount: '40.00',
          status: 'posted',
        },
      ],
      sale_items: [
        {
          id: 'sale-line-1',
          sale_id: 'sale-1',
          item_id: 'item-1',
          quantity: 2,
          unit_price: '20.00',
          subtotal: '40.00',
        },
      ],
      commissions: [
        {
          id: 'commission-1',
          seller_id: 'seller-1',
          sale_id: 'sale-1',
          location_id: 'location-1',
          category_id: 'category-1',
          commission_amount: '1.40',
          commission_rate: '3.50',
          paid: true,
          created_at: '2025-01-01T12:00:00.000Z',
        },
      ],
      payout_runs: [{ id: 'payout-run-draft', status: 'draft' }],
    });

    const seller = plan.operations.find((operation) => operation.table === 'sellers');
    const categoryRate = plan.operations.find(
      (operation) => operation.table === 'seller_category_rates',
    );
    const commission = plan.operations.find((operation) => operation.table === 'commissions');
    expect(seller?.values.default_rate_bps).toBe(200);
    expect(
      plan.operations.find((operation) => operation.table === 'locations')?.values
        .commission_rate_bps,
    ).toBe(125);
    expect(categoryRate?.values.rate_bps).toBe(350);
    expect(commission?.values.amount_cents).toBe('140');
    expect(commission?.values.basis_cents).toBe('4000');
    expect(commission?.values.basis_is_estimated).toBe(false);
    expect(commission?.values.rate_bps).toBe(350);
    expect(commission?.values.status).toBe('paid');
    expect(commission?.values.payout_id).toBe(null);
    expect(plan.operations.some((operation) => operation.table === 'commission_payouts')).toBe(
      false,
    );
    expect(
      plan.conflicts.some(
        (conflict) => conflict.kind === 'LEGACY_PAID_COMMISSIONS_NEED_RECONCILIATION',
      ),
    ).toBe(true);
    expect(
      plan.conflicts.some(
        (conflict) =>
          conflict.kind === 'DEFERRED_ENTITY' && conflict.entityType === 'payoutRuns',
      ),
    ).toBe(false);
    const payoutArchive = plan.operations.find(
      (operation) => operation.table === 'legacy_payout_run_archive',
    );
    expect(payoutArchive?.values.legacy_id).toBe('payout-run-draft');
    expect(payoutArchive?.values.source_record).toEqual({
      id: 'payout-run-draft',
      status: 'draft',
    });
    expect(
      plan.conflicts.some((conflict) => conflict.kind === 'LEGACY_PAYOUT_RUN_ARCHIVED'),
    ).toBe(true);
    expect(hasFatalConflicts(plan)).toBe(false);
  });

  it('rejects active auto-post recurring expenses without a mapped wallet', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      recurringExpenses: [
        {
          id: 'schedule-1',
          name: 'Software',
          vendor_name: 'Example Vendor',
          amount: '20.00',
          currency: 'USD',
          cadence: 'monthly',
          anchor_day: 1,
          next_run_on: '2026-10-01',
          is_active: true,
          auto_post: true,
        },
      ],
    });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'UNMAPPED_RECURRING_EXPENSE_WALLET', severity: 'fatal' }),
    );
  });

  it('rejects combo stock that disagrees with component-derived availability', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [
        { id: 'combo-1', name: 'Daily setup', is_combo: true, selling_price_usd: '40.00' },
        { id: 'item-1', name: 'Headphones', is_combo: false, selling_price_usd: '25.00' },
      ],
      comboItems: [{ id: 'combo-line-1', combo_id: 'combo-1', item_id: 'item-1', quantity: 2 }],
      stock: [
        { id: 'stock-child', item_id: 'item-1', location_id: 'loc-1', quantity: 10 },
        { id: 'stock-combo', item_id: 'combo-1', location_id: 'loc-1', quantity: 4 },
      ],
    });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'BUNDLE_STOCK_MISMATCH', severity: 'fatal' }),
    );
  });

  it('rejects bundle recipes with missing component products or invalid quantities', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      items: [
        { id: 'combo-1', name: 'Daily setup', is_combo: true, selling_price_usd: '40.00' },
      ],
      comboItems: [
        { id: 'combo-line-1', combo_id: 'combo-1', item_id: 'missing-item', quantity: 0 },
      ],
    });

    expect(hasFatalConflicts(plan)).toBe(true);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'MISSING_BUNDLE_COMPONENT_PRODUCT',
          severity: 'fatal',
        }),
      ]),
    );
    expect(plan.operations.some((operation) => operation.table === 'bundles')).toBe(false);
  });

  it('archives historical transfers without changing imported opening balances', () => {
    const plan = buildMigrationPlan(sanitized);
    const stock = plan.operations.filter(
      (operation) => operation.table === 'inventory_movements',
    );
    const transfers = plan.operations.filter(
      (operation) => operation.table === 'legacy_stock_transfer_archive',
    );
    expect(stock).toHaveLength(3);
    expect(stock.map((operation) => operation.values.quantity)).toEqual(
      expect.arrayContaining([3, 5, 10]),
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.values).toMatchObject({
      legacy_id: 'transfer-stock-1',
      legacy_item_id: 'item-watch-1',
      legacy_from_location_id: 'location-main',
      legacy_to_location_id: 'location-watches',
      quantity: 2,
      occurred_at: '2026-08-01T10:00:00.000Z',
    });
    expect(plan.summary.operationRows.legacy_stock_transfer_archive).toBe(1);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'STOCK_TRANSFERS_ARCHIVED', severity: 'info' }),
    );

    const sourceWithoutTransfers = {
      ...(sanitized as Record<string, unknown>),
      stockTransfers: [],
    };
    expect(plan.expected.inventory).toEqual(
      buildMigrationPlan(sourceWithoutTransfers).expected.inventory,
    );
  });

  it('blocks historical transfer rows with an invalid source reference', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      locations: [{ id: 'loc-1', name: 'Main' }],
      items: [{ id: 'item-1', name: 'Headphones', selling_price_usd: '10.00' }],
      stockTransfers: [
        {
          id: 'transfer-invalid',
          itemId: 'missing-item',
          fromLocationId: 'loc-1',
          toLocationId: 'loc-2',
          quantity: 1,
          createdAt: '2026-08-01T10:00:00.000Z',
        },
      ],
    });

    expect(hasFatalConflicts(plan)).toBe(true);
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'INVALID_STOCK_TRANSFER',
        entityKey: 'transfer-invalid',
        severity: 'fatal',
      }),
    );
    expect(
      plan.operations.some((operation) => operation.table === 'legacy_stock_transfer_archive'),
    ).toBe(false);
  });

  it('deduplicates payment-linked ledger history and preserves historical invoice numbers', () => {
    const plan = buildMigrationPlan(sanitized);
    const paymentLedgers = plan.operations.filter(
      (operation) =>
        operation.table === 'ledger_entries' && operation.sourceId === 'payment-full',
    );
    expect(paymentLedgers).toHaveLength(1);
    expect(plan.expected.invoices['sale-full']?.number).toBe('NX-HIST-0001');
    expect(
      plan.operations.find((operation) => operation.table === 'document_sequences'),
    ).toEqual(
      expect.objectContaining({
        conflictTarget: ['prefix'],
        values: expect.objectContaining({ prefix: 'INV-', last_value: 163, padding: 3 }),
      }),
    );
    expect(plan.operations.some((operation) => operation.table === 'wallet_transfers')).toBe(
      true,
    );
    expect(plan.operations.some((operation) => operation.table === 'reconciliations')).toBe(
      true,
    );
  });

  it('keeps the invoice sequence above imported invoice-number suffixes', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      invoiceSequences: [{ prefix: 'INV', lastNumber: 163 }],
      sales: [{ id: 'sale-higher-invoice', invoiceNumber: 'INV-9876' }],
    });

    expect(
      plan.operations.find((operation) => operation.table === 'document_sequences')?.values,
    ).toMatchObject({ prefix: 'INV-', last_value: 9876, padding: 4 });
  });

  it('drops legacy storefront copy that mentions watches and reports it', () => {
    const snapshot = structuredClone(sanitized) as {
      storeSettings: Array<{ key: string; value: string; updatedAt: string }>;
    };
    const updatedAt = '2026-09-20T12:00:00.000Z';
    snapshot.storeSettings.push(
      { key: 'audio_store_description', value: 'Van IEMs tot Invicta-horloges.', updatedAt },
      { key: 'watches_store_description', value: 'Invicta horloges', updatedAt },
    );
    const plan = buildMigrationPlan(snapshot);
    const storefront = (slug: string) =>
      plan.operations.find((o) => o.table === 'storefronts' && o.values.slug === slug);

    expect(storefront('audio')?.values.description).toBeNull();
    expect(storefront('watches')?.values.description).toBe('Invicta horloges');
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'WATCH_COPY_DROPPED',
        entityKey: 'audio:store_description',
      }),
    );
  });

  it('maps open finance obligations and preserves typed storefront settings', () => {
    const plan = buildMigrationPlan(sanitized);
    const obligation = plan.operations.find(
      (operation) => operation.table === 'finance_obligations',
    );
    const settings = plan.operations.find((operation) => operation.table === 'settings');
    const audio = plan.operations.find(
      (operation) => operation.table === 'storefronts' && operation.values.slug === 'audio',
    );
    const watches = plan.operations.find(
      (operation) => operation.table === 'storefronts' && operation.values.slug === 'watches',
    );

    expect(obligation?.values).toMatchObject({
      direction: 'receivable',
      counterparty_name: 'Fixture customer',
      original_amount_cents: '12500',
      paid_amount_cents: '4000',
      status: 'partial',
      due_date: '2026-10-15',
    });
    expect(plan.summary.operationRows.legacy_store_settings).toBe(5);
    expect(settings?.values).toMatchObject({
      singleton: 'settings',
      business_name: 'NextX',
      display_currency: 'SRD',
      hero_title: 'Everyday audio, ready today',
    });
    expect(audio?.values).toMatchObject({
      name: 'NextX Audio',
      hero_title: 'Clear sound for the commute',
    });
    expect(watches?.values.hero_image_url).toBe('/fixture/watches-hero.webp');
    expect(watches?.values.status).toBe('inactive');
    // NextX quotes in SRD: a storefront whose products carry SRD prices must sell in SRD
    // from the SRD price list, not from a converted USD list.
    const srdList = plan.operations.find(
      (operation) => operation.table === 'price_lists' && operation.values.currency === 'SRD',
    );
    expect(srdList).toBeDefined();
    expect(audio?.values.default_currency).toBe('SRD');
    expect(audio?.values.default_price_list_id).toBe(srdList?.values.id);
    expect(
      plan.operations
        .filter(
          (operation) =>
            operation.table === 'storefront_products' &&
            operation.values.storefront_id === watches?.values.id,
        )
        .every((operation) => operation.values.visible === false),
    ).toBe(true);
  });

  it('imports product media only when the source image is mapped to self-hosted Storage', () => {
    const input = JSON.parse(JSON.stringify(sanitized)) as {
      metadata: Record<string, unknown>;
      items: Record<string, unknown>[];
    };
    const sourceUrl = 'https://fixture.public.blob.vercel-storage.com/audio.webp';
    const audio = input.items.find((row) => row.id === 'item-audio-1');
    if (!audio) throw new Error('Audio fixture product is missing');
    audio.imageUrl = sourceUrl;
    input.metadata.nextxMediaMap = {
      version: 1,
      assets: {
        [sourceUrl]: {
          publicUrl:
            'https://storage.nextx.example/storage/v1/object/public/nextly-product-images/legacy/audio.avif',
          blobPathname: 'legacy/audio/1600.avif',
          thumbUrl:
            'https://storage.nextx.example/storage/v1/object/public/nextly-product-images/legacy/audio.webp',
          thumbPathname: 'legacy/audio/400.webp',
          width: 800,
          height: 600,
          byteSize: 12000,
          blurDataUrl: 'data:image/jpeg;base64,AA==',
        },
      },
    };

    const plan = buildMigrationPlan(input);
    const image = plan.operations.find((operation) => operation.table === 'product_images');
    expect(image?.values.url).toContain('storage.nextx.example');
    expect(image?.values.blob_pathname).toBe('legacy/audio/1600.avif');
    expect(image?.values.is_primary).toBe(true);
    expect(plan.conflicts.some((conflict) => conflict.kind === 'UNMAPPED_LEGACY_MEDIA')).toBe(
      false,
    );
    expect(JSON.stringify(plan.operations)).not.toContain('public.blob.vercel-storage.com');
  });

  it('fails closed when a legacy external image has no self-hosted Storage mapping', () => {
    const input = JSON.parse(JSON.stringify(sanitized)) as {
      items: Record<string, unknown>[];
    };
    const audio = input.items.find((row) => row.id === 'item-audio-1');
    if (!audio) throw new Error('Audio fixture product is missing');
    audio.imageUrl = 'https://fixture.public.blob.vercel-storage.com/audio.webp';

    const plan = buildMigrationPlan(input);
    expect(plan.conflicts.some((conflict) => conflict.kind === 'UNMAPPED_LEGACY_MEDIA')).toBe(
      true,
    );
    expect(
      plan.operations.filter((operation) => operation.table === 'product_images'),
    ).toHaveLength(0);
  });

  it('is repeatable and surfaces unsafe conflicts instead of normalizing them away', () => {
    const first = buildMigrationPlan(sanitized);
    const second = buildMigrationPlan(sanitized);
    expect(first.sourceChecksum).toBe(second.sourceChecksum);
    expect(first.mappings).toEqual(second.mappings);
    expect(first.operations).toEqual(second.operations);

    const conflictPlan = buildMigrationPlan(conflicts);
    expect(hasFatalConflicts(conflictPlan)).toBe(true);
    expect(conflictPlan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'DUPLICATE_SKU', severity: 'fatal' }),
        expect.objectContaining({ kind: 'INVALID_CURRENCY', severity: 'fatal' }),
        expect.objectContaining({ kind: 'NEGATIVE_STOCK', severity: 'warning' }),
      ]),
    );
  });

  it('refuses to migrate populated source modules without an approved mapping', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {
          recurring_expenses: '3',
          site_analytics_events: '11872',
        },
      },
      items: [
        { id: 'combo-1', name: 'Daily setup', is_combo: true, selling_price_usd: '40.00' },
        { id: 'item-1', name: 'Headphones', is_combo: false, selling_price_usd: '25.00' },
      ],
      comboItems: [{ id: 'combo-line-1', combo_id: 'combo-1', item_id: 'item-1', quantity: 1 }],
      commissions: [{ id: 'commission-1' }],
    });

    expect(hasFatalConflicts(plan)).toBe(true);
    expect(plan.summary.operationRows.bundles).toBe(1);
    expect(plan.summary.operationRows.bundle_components).toBe(1);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'commissions',
          kind: 'INVALID_COMMISSION_REFERENCE',
        }),
        expect.objectContaining({
          entityType: 'recurring_expenses',
          kind: 'SOURCE_TABLE_ROW_COUNT_MISMATCH',
        }),
      ]),
    );
    expect(
      plan.conflicts.some((conflict) => conflict.entityType === 'site_analytics_events'),
    ).toBe(false);
  });

  it('fails closed for any unrecognized populated public source table', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {
          newly_added_legacy_module: '2',
          _prisma_migrations: '34',
          site_analytics_events: '11872',
          malformed_count: 'unknown',
        },
      },
    });

    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'newly_added_legacy_module',
          kind: 'UNMAPPED_SOURCE_DATA',
          severity: 'fatal',
        }),
        expect.objectContaining({
          entityType: 'malformed_count',
          kind: 'INVALID_SOURCE_TABLE_COUNT',
          severity: 'fatal',
        }),
      ]),
    );
    expect(
      plan.conflicts.some((conflict) => conflict.entityType === '_prisma_migrations'),
    ).toBe(false);
    expect(
      plan.conflicts.some((conflict) => conflict.entityType === 'site_analytics_events'),
    ).toBe(false);
  });

  it('refuses snapshots without a complete source-table inventory', () => {
    const plan = buildMigrationPlan({ metadata: { sourceSystem: 'nextx' } });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        entityType: 'source',
        kind: 'SOURCE_TABLE_INVENTORY_INCOMPLETE',
        severity: 'fatal',
      }),
    );
  });

  it('normalizes reverse exchange-rate input into the USD-to-SRD convention', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      locations: [{ id: 'location-1', name: 'Main' }],
      categories: [{ id: 'category-1', name: 'Audio' }],
      items: [
        { id: 'item-1', name: 'Audio', categoryId: 'category-1', sellingPriceUsd: '10.00' },
      ],
      exchangeRates: [{ id: 'rate-1', srdToUsd: '0.025', setAt: '2026-01-01T00:00:00Z' }],
      sales: [
        {
          id: 'sale-1',
          locationId: 'location-1',
          currency: 'SRD',
          totalAmount: '385.00',
          createdAt: '2026-02-01T00:00:00Z',
        },
      ],
      saleItems: [
        {
          id: 'line-1',
          saleId: 'sale-1',
          itemId: 'item-1',
          quantity: 1,
          unitPrice: '385.00',
          subtotal: '385.00',
        },
      ],
    });
    const sale = plan.operations.find((operation) => operation.table === 'sales');
    expect(sale?.values.fx_rate_micros).toBe('40000000');
    expect(sale?.values.total_usd_cents).toBe('963');
  });

  it('does not map a product image URL into the supplier source URL field', () => {
    const plan = buildMigrationPlan({
      metadata: { sourceSystem: 'nextx', schemaVersion: 'fixture' },
      categories: [{ id: 'category-1', name: 'Audio' }],
      items: [
        {
          id: 'item-1',
          name: 'Audio',
          categoryId: 'category-1',
          sellingPriceUsd: '10.00',
          imageUrl: 'https://example.public.blob.vercel-storage.com/audio.webp',
        },
      ],
    });
    const product = plan.operations.find((operation) => operation.table === 'products');

    expect(product?.values.source_url).toBeNull();
  });

  it('names location-based legacy wallets uniquely by kind and purpose', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      locations: [{ id: 'loc-1', name: 'Main' }],
      wallets: [
        {
          id: 'w-bank',
          person_name: 'Main Street',
          type: 'bank',
          currency: 'SRD',
          balance: '0',
          purpose: 'operational',
        },
        {
          id: 'w-cash',
          person_name: 'Main Street',
          type: 'cash',
          currency: 'SRD',
          balance: '0',
          purpose: 'operational',
        },
        {
          id: 'w-save',
          person_name: 'Main Street',
          type: 'cash',
          currency: 'SRD',
          balance: '0',
          purpose: 'savings',
        },
      ],
    });

    const wallets = plan.operations.filter((operation) => operation.table === 'wallets');
    expect(wallets.map((operation) => [operation.values.name, operation.values.kind])).toEqual([
      ['Main Street · Bank', 'bank_transfer'],
      ['Main Street · Cash', 'cash'],
      ['Main Street · Cash (savings)', 'cash'],
    ]);
    expect(
      plan.conflicts.filter((conflict) => conflict.kind === 'DUPLICATE_WALLET_NAME'),
    ).toHaveLength(0);
  });

  it('fails the plan when legacy wallets still share a name, kind, purpose and currency', () => {
    const plan = buildMigrationPlan({
      metadata: {
        sourceSystem: 'nextx',
        schemaVersion: 'fixture',
        sourceTableInventoryComplete: true,
        sourceTableCounts: {},
      },
      wallets: [
        { id: 'w-1', person_name: 'Main Street', type: 'cash', currency: 'USD', balance: '0' },
        { id: 'w-2', person_name: 'Main Street', type: 'cash', currency: 'USD', balance: '0' },
      ],
    });

    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'DUPLICATE_WALLET_NAME',
        severity: 'fatal',
        entityKey: 'w-2',
      }),
    );
  });
});
