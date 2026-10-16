'use client';

import { parseAsStringEnum, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';

const AVAILABILITY = ['in-stock', 'incoming'] as const;
type Availability = (typeof AVAILABILITY)[number];

/** Real availability only: on-hand stock or outstanding purchase orders. */
export function CatalogAvailability() {
  const [{ availability }, setState] = useQueryStates(
    { availability: parseAsStringEnum<Availability>([...AVAILABILITY]) },
    { shallow: false, history: 'replace' },
  );
  return (
    <Select
      aria-label="Beschikbaarheid"
      value={availability ?? ''}
      onChange={(event) =>
        setState({ availability: (event.target.value || null) as Availability | null })
      }
      className="h-11 w-auto min-w-[148px] rounded-full border-line-subtle pl-4 text-[14px]"
    >
      <option value="">Alle producten</option>
      <option value="in-stock">Op voorraad</option>
      <option value="incoming">Binnenkort verwacht</option>
    </Select>
  );
}
