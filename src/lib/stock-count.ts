/**
 * Stock counting, as pure rules shared by the counting screen and the server.
 *
 * A count says "there are N on the shelf". The system works out the difference to what it expected
 * and posts that difference as an ordinary adjustment movement, so the ledger stays append-only and
 * stock can never be set to a negative number by a count.
 */

export const MAX_COUNTED = 1_000_000;

/** counted minus expected: positive means more on the shelf than the books said. */
export function countDifference(expected: number, counted: number): number {
  return counted - expected;
}

export function parseCounted(
  raw: string | number | null | undefined,
): { ok: true; value: number } | { ok: false; error: string } {
  const text = String(raw ?? '').trim();
  if (text === '') return { ok: false, error: 'Enter how many you counted.' };
  if (!/^\d+$/.test(text)) return { ok: false, error: 'Whole units only, zero or more.' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > MAX_COUNTED) {
    return { ok: false, error: 'That is too many to be right. Check the number.' };
  }
  return { ok: true, value };
}

export type CountLine = {
  variantId: string;
  expected: number;
  counted: number;
};

export type CountSummary = {
  lines: number;
  matched: number;
  over: number;
  short: number;
  /** Net change in units if every line is posted. */
  netUnits: number;
  /** Lines whose difference is not zero: the ones that will post a movement. */
  changing: number;
};

export function summariseCounts(lines: readonly CountLine[]): CountSummary {
  const summary: CountSummary = {
    lines: lines.length,
    matched: 0,
    over: 0,
    short: 0,
    netUnits: 0,
    changing: 0,
  };
  for (const line of lines) {
    const difference = countDifference(line.expected, line.counted);
    summary.netUnits += difference;
    if (difference === 0) summary.matched += 1;
    else {
      summary.changing += 1;
      if (difference > 0) summary.over += 1;
      else summary.short += 1;
    }
  }
  return summary;
}

/** "+3", "-2" or "No difference" for a line. */
export function describeDifference(difference: number): string {
  if (difference === 0) return 'No difference';
  return `${difference > 0 ? '+' : '-'}${Math.abs(difference)}`;
}
