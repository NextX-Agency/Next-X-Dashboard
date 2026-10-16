import { describe, expect, it } from 'vitest';
import { ownerReviewCsv } from '../../scripts/migrate-nextx/owner-review';

const checksum = 'c3e00be3482fc1adcc692b18d0b504cd2df9bebb428290cf9f62a8a1a24791df';

describe('NextX migration owner review export', () => {
  it('exports actionable conflicts without messages or source row details', () => {
    const csv = ownerReviewCsv({
      generatedAt: '2026-09-24T16:06:26.263Z',
      sourceChecksum: checksum,
      conflicts: [
        {
          severity: 'fatal',
          kind: 'COMPLETED_RESERVATION_WITHOUT_SALE_LINK',
          entityType: 'reservations',
          entityKey: 'reservation-1',
          message: 'Sensitive row detail must not be exported.',
          details: { customerName: 'Example Person' },
        },
        {
          severity: 'info',
          kind: 'DEFERRED_ENTITY',
          entityType: 'budgets',
          message: 'Informational.',
        },
      ],
    });

    expect(csv).toContain('"reservation-1"');
    expect(csv).toContain(
      '"Provide a direct source reservation-to-sale link; do not infer from product, amount, date, or customer."',
    );
    expect(csv).toContain('"OwnerDecision","EvidenceReference","ReviewedBy","ReviewedAt"');
    expect(csv).not.toContain('Sensitive row detail');
    expect(csv).not.toContain('Example Person');
    expect(csv).not.toContain('DEFERRED_ENTITY');
  });

  it('omits unsafe identifiers and malformed conflict fields', () => {
    const csv = ownerReviewCsv({
      generatedAt: '2026-09-24T16:06:26.263Z',
      sourceChecksum: checksum,
      conflicts: [
        {
          severity: 'warning',
          kind: 'UNLINKED_REFUND',
          entityType: 'walletTransactions',
          entityKey: 'buyer@example.com',
        },
        { severity: 'warning', kind: 'invalid kind', entityType: 'sales', entityKey: 'sale-1' },
      ],
    });

    expect(csv).not.toContain('buyer@example.com');
    expect(csv).not.toContain('"sale-1"');
    expect(csv.match(/\r\n/g)).toHaveLength(2);
  });

  it('rejects reports without an immutable source checksum', () => {
    expect(() =>
      ownerReviewCsv({ generatedAt: '2026-09-24T16:06:26.263Z', conflicts: [] }),
    ).toThrow('Migration report is missing its generation time or source checksum.');
  });
});
