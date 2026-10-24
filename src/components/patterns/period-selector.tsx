'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { PERIOD_PRESETS, type PeriodPreset } from '@/lib/report-period';

/** Bound to `?period=`; the server page resolves the preset into actual
 *  dates via `lib/report-period.ts`'s `periodRange`. The default must match
 *  the server page's own fallback, or the control shows one period while
 *  the figures are computed for another.
 *
 *  From `md` it is the compact select. On a phone it is a segmented control: every choice in
 *  sight, one tap each, and sideways scrolling (snapping, with the selected one kept in view)
 *  for the choices that do not fit. */
export function PeriodSelector({ defaultValue = 'all' }: { defaultValue?: PeriodPreset }) {
  const [period, setPeriod] = useQueryState(
    'period',
    parseAsString.withDefault(defaultValue).withOptions({ shallow: false, history: 'replace' }),
  );

  return (
    <>
      <Select
        aria-label="Period"
        value={period}
        onChange={(event) => setPeriod(event.target.value)}
        className="h-8 w-auto text-[12px] max-md:hidden"
      >
        {Object.entries(PERIOD_PRESETS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      <div
        role="radiogroup"
        aria-label="Period choices"
        className="flex min-w-0 max-w-full flex-1 snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain md:hidden [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {Object.entries(PERIOD_PRESETS).map(([value, label]) => {
          const selected = period === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a segmented control; the radio role is the accessible model for it
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              ref={(node) => {
                if (selected && node) {
                  const parent = node.parentElement;
                  if (parent && node.offsetLeft + node.offsetWidth > parent.clientWidth) {
                    parent.scrollLeft = node.offsetLeft - 8;
                  }
                }
              }}
              onClick={() => setPeriod(value)}
              className={cn(
                'h-11 shrink-0 snap-start rounded-full border px-4 text-[14px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                selected
                  ? 'border-accent bg-accent font-semibold text-accent-fg'
                  : 'border-line bg-raised text-ink-2 active:bg-hover',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
