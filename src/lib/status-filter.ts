import { humanise } from '@/lib/format';

/**
 * Filter options for a status column, built from its badge-tone map.
 *
 * The label is the business status ("Draft", "Ready"), never the badge's visual tone
 * ("Neutral", "Warning"): the tone only decides the colour.
 */
export function statusFilterOptions(tones: Record<string, string>) {
  return Object.keys(tones).map((value) => ({ value, label: humanise(value) }));
}
