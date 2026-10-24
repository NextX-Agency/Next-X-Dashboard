import { describe, expect, it } from 'vitest';
import { publicQuoteState } from '@/lib/quote-validity';

const now = new Date('2026-06-15T12:00:00Z');

describe('publicQuoteState', () => {
  it('shows a quote that is still valid', () => {
    expect(publicQuoteState({ status: 'sent', validUntil: '2026-06-20T00:00:00Z' }, now)).toBe(
      'open',
    );
  });

  it('expires a quote whose valid-until moment has passed, even if never marked expired', () => {
    expect(publicQuoteState({ status: 'sent', validUntil: '2026-06-14T23:59:59Z' }, now)).toBe(
      'expired',
    );
    expect(
      publicQuoteState({ status: 'viewed', validUntil: new Date('2026-01-01') }, now),
    ).toBe('expired');
  });

  it('hides a void quote entirely and honours an explicit expired status', () => {
    expect(publicQuoteState({ status: 'void', validUntil: '2030-01-01T00:00:00Z' }, now)).toBe(
      'hidden',
    );
    expect(
      publicQuoteState({ status: 'expired', validUntil: '2030-01-01T00:00:00Z' }, now),
    ).toBe('expired');
  });

  it('does not invent an expiry from a missing or unreadable date', () => {
    expect(publicQuoteState({ status: 'sent', validUntil: null }, now)).toBe('open');
    expect(publicQuoteState({ status: 'sent', validUntil: 'not a date' }, now)).toBe('open');
  });
});
