'use client';

import { optionName } from '@/lib/product-options';
import { useProductSelection } from './product-selection';

/** Pickup stock for the option that is chosen right now, one row per location. */
export function PickupStock() {
  const { variant, variants } = useProductSelection();
  if (variant.locations.length === 0) return null;
  const label = variants.length > 1 ? optionName(variant) : null;
  return (
    <section className="mt-6 rounded-tile border border-line p-4 sm:p-5">
      <h2 className="font-bold text-[14px]">
        Pickup: stock by location
        {label ? <span className="font-normal text-ink-3"> · {label}</span> : null}
      </h2>
      <ul className="mt-3 space-y-3">
        {variant.locations.map((location) => (
          <li
            key={location.name}
            className="flex items-center justify-between gap-4 text-[14px]"
          >
            <span className="font-semibold">{location.name}</span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-semibold text-[12px] ${
                location.available > 0
                  ? 'bg-positive-muted text-positive'
                  : 'bg-sunken text-ink-3'
              }`}
            >
              {location.available > 0 ? `${location.available} available` : 'No stock'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
