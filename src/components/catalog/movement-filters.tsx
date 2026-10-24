'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';

/**
 * Filters for the stock movement history on the product screen: what kind of movement, which
 * variant, and a date range. They live in the address (`mkind`, `mvariant`, `mfrom`, `mto`), so a
 * filtered view can be shared or reloaded, and the server re-queries, exactly like the list pages.
 */

const KIND_OPTIONS = [
  { value: 'receipt', label: 'Received' },
  { value: 'sale', label: 'Sold' },
  { value: 'return', label: 'Returned' },
  { value: 'adjustment', label: 'Counted or corrected' },
  { value: 'write_off', label: 'Written off' },
];

export function MovementFilters({ variants }: { variants: { id: string; label: string }[] }) {
  const [state, setState] = useQueryStates(
    {
      mkind: parseAsString,
      mvariant: parseAsString,
      mfrom: parseAsString,
      mto: parseAsString,
      mpage: parseAsString,
    },
    { shallow: false, history: 'replace', scroll: false },
  );
  const dateClass = cn(
    'h-11 w-full min-w-0 rounded-control border border-line bg-raised px-2.5 text-[16px] text-ink sm:h-8 sm:text-[12px]',
    'focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
  );
  const active = Boolean(state.mkind || state.mvariant || state.mfrom || state.mto);

  return (
    <div className="grid grid-cols-2 items-end gap-2 border-line-subtle border-b p-3 sm:flex sm:flex-wrap">
      <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3 uppercase tracking-[0.06em]">
        <span aria-hidden="true">Kind</span>
        <Select
          aria-label="Kind"
          value={state.mkind ?? ''}
          onChange={(event) => setState({ mkind: event.target.value || null, mpage: null })}
          className="sm:h-8 sm:w-auto sm:min-w-[150px] sm:text-[12px]"
        >
          <option value="">Every kind</option>
          {KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {variants.length > 1 ? (
        <div className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3 uppercase tracking-[0.06em]">
          <span aria-hidden="true">Variant</span>
          <Select
            aria-label="Variant"
            value={state.mvariant ?? ''}
            onChange={(event) =>
              setState({ mvariant: event.target.value || null, mpage: null })
            }
            className="sm:h-8 sm:w-auto sm:min-w-[150px] sm:text-[12px]"
          >
            <option value="">Every variant</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3 uppercase tracking-[0.06em]">
        From
        <input
          type="date"
          value={state.mfrom ?? ''}
          max={state.mto ?? undefined}
          onChange={(event) => setState({ mfrom: event.target.value || null, mpage: null })}
          className={dateClass}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-3 uppercase tracking-[0.06em]">
        To
        <input
          type="date"
          value={state.mto ?? ''}
          min={state.mfrom ?? undefined}
          onChange={(event) => setState({ mto: event.target.value || null, mpage: null })}
          className={dateClass}
        />
      </label>
      {active ? (
        <button
          type="button"
          onClick={() =>
            setState({ mkind: null, mvariant: null, mfrom: null, mto: null, mpage: null })
          }
          className="col-span-2 h-11 rounded-control px-3 text-[13px] text-accent hover:bg-hover sm:col-span-1 sm:h-8"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
