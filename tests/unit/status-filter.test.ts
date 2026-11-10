import { describe, expect, it } from 'vitest';
import { statusFilterOptions } from '@/lib/status-filter';

describe('statusFilterOptions', () => {
  it('labels each option with the business status, not the badge tone', () => {
    expect(
      statusFilterOptions({
        draft: 'neutral',
        confirmed: 'info',
        ready: 'warning',
        completed: 'positive',
        cancelled: 'negative',
      }),
    ).toEqual([
      { value: 'draft', label: 'Draft' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'ready', label: 'Ready' },
      { value: 'completed', label: 'Completed' },
      { value: 'cancelled', label: 'Cancelled' },
    ]);
  });

  it('humanises multi-word statuses', () => {
    expect(statusFilterOptions({ partially_paid: 'warning' })).toEqual([
      { value: 'partially_paid', label: 'Partially paid' },
    ]);
  });
});
