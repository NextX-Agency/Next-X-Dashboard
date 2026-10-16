'use client';

import { parseAsString, useQueryStates } from 'nuqs';
import { Select } from '@/components/ui/field';
import { PRICE_TIER_KEYS, priceTierLabels } from '@/lib/price-tiers';

export function CatalogFilters({
  options,
}: {
  options: {
    brands: { name: string; slug: string }[];
    platforms: string[];
    protocols: string[];
    priceCurrency: 'USD' | 'SRD';
  };
}) {
  const [filters, setFilters] = useQueryStates(
    {
      brand: parseAsString,
      platform: parseAsString,
      protocol: parseAsString,
      new: parseAsString,
      price: parseAsString,
      page: parseAsString,
    },
    { shallow: false, history: 'replace' },
  );
  const set = (key: keyof typeof filters, value: string) =>
    setFilters({ [key]: value || null, page: null });
  const priceLabels = priceTierLabels(options.priceCurrency);
  return (
    <details className="w-full border-t border-line-subtle pt-3">
      <summary className="cursor-pointer text-[12px] font-medium text-ink-2">
        Meer filters
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          aria-label="Merk"
          value={filters.brand ?? ''}
          onChange={(event) => set('brand', event.target.value)}
        >
          <option value="">Alle merken</option>
          {options.brands.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </Select>
        {options.platforms.length ? (
          <Select
            aria-label="Werkt met"
            value={filters.platform ?? ''}
            onChange={(event) => set('platform', event.target.value)}
          >
            <option value="">Alle apparaten</option>
            {options.platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </Select>
        ) : null}
        {options.protocols.length ? (
          <Select
            aria-label="Verbinding"
            value={filters.protocol ?? ''}
            onChange={(event) => set('protocol', event.target.value)}
          >
            <option value="">Alle verbindingen</option>
            {options.protocols.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocol}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          aria-label="Nieuw"
          value={filters.new ?? ''}
          onChange={(event) => set('new', event.target.value)}
        >
          <option value="">Alle producten</option>
          <option value="true">Alleen nieuw</option>
        </Select>
        <Select
          aria-label="Prijsklasse"
          value={filters.price ?? ''}
          onChange={(event) => set('price', event.target.value)}
        >
          <option value="">Alle prijzen</option>
          {PRICE_TIER_KEYS.map((key) => (
            <option key={key} value={key}>
              {priceLabels[key]}
            </option>
          ))}
        </Select>
      </div>
    </details>
  );
}
