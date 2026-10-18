import { describe, expect, it } from 'vitest';
import {
  customerQuerySchema,
  expenseQuerySchema,
  ledgerQuerySchema,
  orderQuerySchema,
  parseListParams,
} from '@/lib/list-params';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('order filters', () => {
  it('reads customer, day range and payment status', () => {
    const query = parseListParams(orderQuerySchema, {
      customer: UUID,
      from: '2026-04-01',
      to: '2026-04-30',
      payment: 'partly',
    });
    expect(query).toMatchObject({
      customer: UUID,
      from: '2026-04-01',
      to: '2026-04-30',
      payment: 'partly',
    });
  });

  it('drops a hand-edited value instead of failing the page', () => {
    const query = parseListParams(orderQuerySchema, {
      customer: 'not-a-uuid',
      from: '04/01/2026',
      to: '2026-4-30',
      payment: 'overdue', // a sale concept: orders only know paid, partly, unpaid
    });
    expect(query.customer).toBeUndefined();
    expect(query.from).toBeUndefined();
    expect(query.to).toBeUndefined();
    expect(query.payment).toBeUndefined();
  });
});

describe('ledger filters', () => {
  it('reads day range, currency, wallet and direction', () => {
    const query = parseListParams(ledgerQuerySchema, {
      from: '2026-03-01',
      to: '2026-03-31',
      currency: 'SRD',
      wallet: UUID,
      type: 'out',
      category: 'operating',
    });
    expect(query).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
      currency: 'SRD',
      wallet: UUID,
      type: 'out',
      category: 'operating',
    });
  });

  it('ignores an unknown currency, direction or wallet', () => {
    const query = parseListParams(ledgerQuerySchema, {
      currency: 'EUR',
      type: 'sideways',
      wallet: 'cash',
    });
    expect(query.currency).toBeUndefined();
    expect(query.type).toBeUndefined();
    expect(query.wallet).toBeUndefined();
  });
});

describe('customer and expense date ranges', () => {
  it('read a day range and ignore a malformed day', () => {
    const range = { from: '2026-05-01', to: '2026-05-31' };
    const malformed = { from: 'yesterday', to: '' };
    expect(parseListParams(customerQuerySchema, range)).toMatchObject(range);
    expect(parseListParams(expenseQuerySchema, range)).toMatchObject(range);
    for (const bad of [
      parseListParams(customerQuerySchema, malformed),
      parseListParams(expenseQuerySchema, malformed),
    ]) {
      expect(bad.from).toBeUndefined();
      expect(bad.to).toBeUndefined();
    }
  });
});
