/**
 * Which URL parameters a list filter control owns, and how many of them are in use.
 *
 * The list toolbar folds its filters behind one "Filters" button on a phone; the button shows how
 * many are active. A control is described by the props it was given (`param` for a select,
 * `minParam` / `maxParam` for a number range, `fromParam` / `toParam` for a date range, which
 * default to `from` and `to`), so the count needs no knowledge of the components themselves.
 */

export type FilterProps = {
  param?: string;
  minParam?: string;
  maxParam?: string;
  fromParam?: string;
  toParam?: string;
  /** A sort control: it owns `sort` and `dir`, which are an order, not a filter, and are never counted. */
  sorting?: boolean;
};

export function filterParamsOf(props: FilterProps): string[] {
  if (props.sorting) return [];
  if (props.param) return [props.param];
  if (props.minParam || props.maxParam) {
    return [props.minParam, props.maxParam].filter((value): value is string => Boolean(value));
  }
  return [props.fromParam ?? 'from', props.toParam ?? 'to'];
}

/** A control counts once however many of its parameters are set (a from/to pair is one filter). */
export function countActiveFilters(
  controls: readonly (readonly string[])[],
  searchParams: { get(name: string): string | null } | null,
): number {
  if (!searchParams) return 0;
  return controls.filter((params) =>
    params.some((param) => (searchParams.get(param) ?? '') !== ''),
  ).length;
}
