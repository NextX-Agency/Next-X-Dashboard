'use client';

import { optionName } from '@/lib/product-options';
import { useProductSelection } from './product-selection';

/**
 * Pickup availability for the option that is chosen right now, one row per location. Words, not counts:
 * which place has it is the useful fact, how many is not.
 */
export function PickupStock() {
  const { variant, variants } = useProductSelection();
  if (variant.locations.length === 0) return null;
  const label = variants.length > 1 ? optionName(variant) : null;
  return (
    <section className="mt-6 border-line border-t pt-5">
      <h2 className="font-bold text-[14px]">
        Pickup: stock by location
        {label ? <span className="font-normal text-ink-3"> · {label}</span> : null}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {variant.locations.map((location) => (
          <li
            key={location.name}
            className="flex min-h-11 items-center justify-between gap-4 text-[14px]"
          >
            <span className="font-semibold">{location.name}</span>
            <span
              className={location.available > 0 ? 'shrink-0 text-ink-2' : 'shrink-0 text-ink-3'}
            >
              {location.available > 0 ? 'Available' : 'Sold out'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
