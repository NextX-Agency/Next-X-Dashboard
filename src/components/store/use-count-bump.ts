'use client';

import { useState } from 'react';

/**
 * Tells a badge when its number changed, so it can bump once. Returns 0 until the count really
 * changes: the first value that arrives (the saved cart being read on load) is not news, so a returning
 * customer's badge does not bump on every page. The returned number is a `key`: remounting the badge
 * replays its one-shot CSS animation.
 */
export function useCountBump(count: number, ready: boolean): number {
  const [seen, setSeen] = useState<number | null>(null);
  const [bumps, setBumps] = useState(0);
  if (ready && seen !== count) {
    setSeen(count);
    if (seen !== null) setBumps(bumps + 1);
  }
  return bumps;
}
