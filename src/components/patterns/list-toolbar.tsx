'use client';

import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { parseAsString, useQueryStates } from 'nuqs';
import {
  Children,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { countActiveFilters, type FilterProps, filterParamsOf } from '@/lib/list-filters';

/**
 * The client half of a list page — search and filter controls. Sort and
 * pagination stay plain server-rendered `<Link>`s (`ui/table.tsx`'s
 * `THSort`, `ui/pagination.tsx`); only text search and filter selects need
 * a client boundary at all, since only they write on every keystroke or
 * every change rather than on navigation.
 *
 * Pass the `ListSearch` as `search` and any number of filters (`ListFilter`, `ListDateRange`,
 * `ListNumberRange`) as children. (They are told apart by the slot, not by element type: a server
 * page hands this component client references, which cannot be compared against the real thing.)
 *
 * From `md` they sit in one wrapping row. On a phone that row would cost a screen, so the search
 * stays and every filter moves behind a single "Filters" button with a count of the ones in use;
 * the button opens a bottom sheet where each filter has a label and a full-width control. The
 * toolbar then pins itself under the top bar so the search is always at hand.
 */
export function ListToolbar({
  search,
  children,
}: {
  search?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const filters = Children.toArray(children);
  const params = filters.flatMap((item) => filterParams(item));
  const searchParams = useSearchParams();
  const active = countActiveFilters(filters.map(filterParams), searchParams);
  const [, setAll] = useQueryStates(
    Object.fromEntries([...params, 'page'].map((param) => [param, parseAsString])),
    { shallow: false, history: 'replace' },
  );

  return (
    <div
      className={cn(
        'border-line-subtle border-b p-2 md:p-3',
        // Phone: pinned under the top bar, which may be sliding away.
        'max-md:sticky max-md:top-[var(--shell-top,0px)] max-md:z-20 max-md:rounded-t-card max-md:bg-raised',
        'max-md:transition-[top] max-md:duration-200 motion-reduce:max-md:transition-none',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {search}
        {filters.length > 0 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="shrink-0 md:hidden"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filters
              {active > 0 ? (
                <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-accent-fg">
                  {active}
                  <span className="sr-only"> active</span>
                </span>
              ) : null}
            </Button>
            <div className="hidden flex-wrap items-center gap-2 md:contents">{filters}</div>
          </>
        ) : null}
      </div>

      {filters.length > 0 ? (
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title="Filters"
          footer={
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={active === 0}
                onClick={() =>
                  setAll(Object.fromEntries([...params, 'page'].map((p) => [p, null])))
                }
              >
                Clear all
              </Button>
              <Button
                type="button"
                variant="primary"
                className="flex-1"
                onClick={() => setOpen(false)}
              >
                Show results
              </Button>
            </>
          }
        >
          <ToolbarLayout.Provider value="sheet">
            <div className="flex flex-col gap-4">{filters}</div>
          </ToolbarLayout.Provider>
        </Sheet>
      ) : null}
    </div>
  );
}

/** Where a filter is drawn: in the wrapping desktop row, or stacked with labels inside the sheet. */
const ToolbarLayout = createContext<'row' | 'sheet'>('row');

/** The query parameters a filter element reads and writes. */
function filterParams(node: unknown): string[] {
  if (!isValidElement(node)) return [];
  return filterParamsOf((node as ReactElement<FilterProps>).props);
}

/** `sm` is the dashboard's dense default (unchanged from before this variant
 *  existed); `md` is sized for the storefront's open controls
 *  (see docs/03-design/design-system.md). */
const SEARCH_SIZES = {
  sm: {
    input:
      'h-11 rounded-control border-line py-1.5 pr-11 pl-9 text-[16px] md:h-8 md:pr-7 md:pl-8 md:text-[13px]',
    icon: 'left-3 size-4 md:left-2.5 md:size-3.5',
    clear: 'right-0 size-11 md:right-1.5 md:size-5',
    clearIcon: 'size-4 md:size-3.5',
  },
  md: {
    input: 'h-11 rounded-full border-line-subtle py-2 pr-9 pl-10 text-[14px]',
    icon: 'left-3.5 size-4',
    clear: 'right-2.5 size-6',
    clearIcon: 'size-4',
  },
} as const;

/**
 * Free-text search, bound to `?q=`. Throttled so a keystroke does not fire a
 * navigation per character, and `shallow: false` so the *server* re-renders
 * — that round trip is the entire mechanism, there is no client-side
 * filtering to fall back on.
 */
export function ListSearch({
  placeholder = 'Search',
  size = 'sm',
  className,
}: {
  placeholder?: string;
  size?: keyof typeof SEARCH_SIZES;
  className?: string;
}) {
  const [{ q }, setState] = useQueryStates(
    { q: parseAsString.withDefault(''), page: parseAsString },
    { shallow: false, throttleMs: 300, history: 'replace' },
  );
  const sizeClasses = SEARCH_SIZES[size];

  return (
    <div className="relative min-w-0 flex-1 md:min-w-[200px] md:basis-0 md:max-w-[280px]">
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-4',
          sizeClasses.icon,
        )}
      />
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={q}
        placeholder={placeholder}
        onChange={(event) => {
          const value = event.target.value;
          // A filter change always returns to page 1 — staying on page 7 of
          // a list that now has 2 pages is the classic bug this avoids.
          setState({ q: value || null, page: null });
        }}
        className={cn(
          'w-full border bg-raised text-ink',
          'placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          sizeClasses.input,
          className,
        )}
      />
      {q ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setState({ q: null, page: null })}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 grid place-items-center rounded-control text-ink-4 hover:bg-hover hover:text-ink',
            sizeClasses.clear,
          )}
        >
          <X className={sizeClasses.clearIcon} />
        </button>
      ) : null}
    </div>
  );
}

/** A single-select filter bound to an arbitrary param name, writing on
 *  every change rather than throttled — a select fires far less often than
 *  a keystroke, so there is nothing to batch. */
export function ListFilter({
  param,
  label,
  options,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const [state, setState] = useQueryStates(
    { [param]: parseAsString, page: parseAsString },
    { shallow: false, history: 'replace' },
  );
  const value = state[param] ?? '';
  const layout = useContext(ToolbarLayout);

  const select = (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setState({ [param]: next || null, page: null });
      }}
      className={cn(layout === 'row' && 'h-8 w-auto min-w-[120px] text-[12px]')}
    >
      <option value="">{layout === 'sheet' ? 'Any' : label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
  return layout === 'sheet' ? <SheetField label={label}>{select}</SheetField> : select;
}

/**
 * How the rows are ordered: one choice that writes `sort` and `dir` together ("Price, high to low").
 * It sits among the filters (in the phone sheet it is the first field) but is an order, not a
 * filter, so it never counts toward the "Filters" badge and "Clear all" leaves it alone.
 */
export function ListSort({
  options,
  defaultSort,
  defaultDir = 'asc',
  label = 'Sort by',
}: {
  /** `value` is `sort:dir`, for example `price:desc`. */
  options: { value: string; label: string }[];
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
  label?: string;
  sorting: true;
}) {
  const [state, setState] = useQueryStates(
    { sort: parseAsString, dir: parseAsString, page: parseAsString },
    { shallow: false, history: 'replace' },
  );
  const layout = useContext(ToolbarLayout);
  const value = `${state.sort ?? defaultSort}:${state.dir ?? defaultDir}`;
  const known = options.some((option) => option.value === value);
  const select = (
    <Select
      aria-label={label}
      value={known ? value : `${defaultSort}:${defaultDir}`}
      onChange={(event) => {
        const [sort, dir] = event.target.value.split(':');
        setState({ sort: sort ?? null, dir: dir ?? null, page: null });
      }}
      className={cn(layout === 'row' && 'h-8 w-auto min-w-[120px] text-[12px]')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {layout === 'row' ? `Sort: ${option.label}` : option.label}
        </option>
      ))}
    </Select>
  );
  return layout === 'sheet' ? <SheetField label={label}>{select}</SheetField> : select;
}

/** A labelled slot for one filter inside the phone sheet. */
function SheetField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-ink-3 uppercase tracking-[0.08em]">{label}</span>
      {children}
    </div>
  );
}

/** A from/to pair of calendar days bound to two params. Either end may be left empty. */
export function ListDateRange({
  fromParam = 'from',
  toParam = 'to',
  label = 'Date',
}: {
  fromParam?: string;
  toParam?: string;
  label?: string;
}) {
  const [state, setState] = useQueryStates(
    { [fromParam]: parseAsString, [toParam]: parseAsString, page: parseAsString },
    { shallow: false, history: 'replace' },
  );
  const layout = useContext(ToolbarLayout);
  const inputClass = cn(
    'rounded-control border border-line bg-raised text-ink focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    layout === 'sheet' ? 'h-11 w-full min-w-0 px-2.5 text-[16px]' : 'h-8 px-2 text-[12px]',
  );
  const from = (
    <input
      type="date"
      aria-label={`${label} from`}
      value={state[fromParam] ?? ''}
      max={state[toParam] ?? undefined}
      onChange={(event) => setState({ [fromParam]: event.target.value || null, page: null })}
      className={inputClass}
    />
  );
  const to = (
    <input
      type="date"
      aria-label={`${label} to`}
      value={state[toParam] ?? ''}
      min={state[fromParam] ?? undefined}
      onChange={(event) => setState({ [toParam]: event.target.value || null, page: null })}
      className={inputClass}
    />
  );

  if (layout === 'sheet') {
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[12px] text-ink-3 uppercase tracking-[0.08em]">
          {label}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-3">
            From
            {from}
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-[12px] text-ink-3">
            To
            {to}
          </div>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      <legend className="sr-only">{label} range</legend>
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <span>{label} from</span>
        {from}
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <span>to</span>
        {to}
      </div>
    </fieldset>
  );
}

/** A min/max pair of amounts bound to two params. */
export function ListNumberRange({
  minParam,
  maxParam,
  label,
}: {
  minParam: string;
  maxParam: string;
  label: string;
}) {
  const [state, setState] = useQueryStates(
    { [minParam]: parseAsString, [maxParam]: parseAsString, page: parseAsString },
    { shallow: false, throttleMs: 400, history: 'replace' },
  );
  const layout = useContext(ToolbarLayout);
  const inputClass = cn(
    'tabular rounded-control border border-line bg-raised text-ink focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    layout === 'sheet' ? 'h-11 w-full min-w-0 px-2.5 text-[16px]' : 'h-8 w-20 px-2 text-[12px]',
  );
  const clean = (value: string) => value.replace(/[^\d.]/g, '') || null;
  const min = (
    <input
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={`${label} minimum`}
      placeholder="Min"
      value={state[minParam] ?? ''}
      onChange={(event) => setState({ [minParam]: clean(event.target.value), page: null })}
      className={inputClass}
    />
  );
  const max = (
    <input
      inputMode="decimal"
      enterKeyHint="done"
      aria-label={`${label} maximum`}
      placeholder="Max"
      value={state[maxParam] ?? ''}
      onChange={(event) => setState({ [maxParam]: clean(event.target.value), page: null })}
      className={inputClass}
    />
  );

  if (layout === 'sheet') {
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[12px] text-ink-3 uppercase tracking-[0.08em]">
          {label}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {min}
          {max}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="flex items-center gap-1.5">
      <legend className="sr-only">{label} range</legend>
      <span className="text-[12px] text-ink-3">{label}</span>
      {min}
      <span aria-hidden="true" className="text-ink-4">
        –
      </span>
      {max}
    </fieldset>
  );
}
