'use client';

import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { describeResults, UNDO_WINDOW_MS, type UndoPlan } from '@/lib/bulk-undo';
import { restoreCatalogChanges } from '@/server/actions/catalog-bulk';

/**
 * The "Undo" toast for a catalog change.
 *
 * The change that just happened returned the value before and after for every item. This keeps
 * that behind a toast button for 30 seconds. Pressing it sends the inverse to the server, which
 * puts an item back only if it still holds what the change wrote, so an undo can never overwrite
 * newer work; anything it leaves alone is named in the answer.
 */
export function useCatalogUndo() {
  const router = useRouter();
  const { executeAsync } = useAction(restoreCatalogChanges);

  return useCallback(
    (message: string, plan: UndoPlan | null, description?: string) => {
      const base = { duration: plan ? UNDO_WINDOW_MS : 6000 } as const;
      if (!plan) {
        toast.success(message, { ...base, ...(description ? { description } : {}) });
        return;
      }
      toast.success(message, {
        ...base,
        ...(description ? { description } : {}),
        action: {
          label: 'Undo',
          onClick: async () => {
            const result = await executeAsync(plan);
            if (result?.data) {
              const text = describeResults(result.data.results, 'restored');
              if (result.data.skipped > 0) {
                const reason = result.data.results.find((item) => item.outcome === 'skipped');
                toast.warning(`Undo: ${text}`, {
                  description:
                    reason?.message ?? 'Some items changed again and were left alone.',
                });
              } else {
                toast.success(`Undone: ${text}`);
              }
              router.refresh();
            } else {
              toast.error(result?.serverError ?? 'Could not undo that change.');
            }
          },
        },
      });
    },
    [executeAsync, router],
  );
}
