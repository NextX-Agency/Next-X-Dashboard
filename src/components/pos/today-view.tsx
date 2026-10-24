'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadPosToday } from '@/server/actions/pos';
import type { PosToday } from '@/server/queries/pos';
import { TodayPanel } from './today-panel';

/**
 * Today, with its own refresh. On the /pos/today page the first figures arrive with the page; inside
 * the counter screen there are none yet, so it loads them when the tab opens. Either way "Refresh"
 * reads the day again from the database (money screens are never cached).
 */
export function TodayView({
  initial,
  memberId,
  role,
  businessName,
}: {
  initial: PosToday | null;
  memberId: string;
  role: 'owner' | 'staff' | 'viewer';
  businessName: string;
}) {
  const [data, setData] = useState<PosToday | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    try {
      const result = await loadPosToday({});
      if (result?.data) setData(result.data);
      else setProblem(result?.serverError ?? 'Could not load today.');
    } catch {
      setProblem('Could not load today. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initial === null) void load();
  }, [initial, load]);

  if (!data) {
    return (
      <div className="grid min-h-48 place-items-center text-[14px] text-ink-3" role="status">
        {problem ? (
          <div className="text-center">
            <p className="text-negative">{problem}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 min-h-11 text-accent underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading today
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {problem ? (
        <p role="alert" className="mb-3 text-[13px] text-negative">
          {problem}
        </p>
      ) : null}
      <TodayPanel
        data={data}
        memberId={memberId}
        role={role}
        businessName={businessName}
        refreshing={loading}
        onRefresh={() => void load()}
      />
    </>
  );
}
