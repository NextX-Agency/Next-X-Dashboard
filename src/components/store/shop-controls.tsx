'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';
import { PRICE_TIER_KEYS, priceTierLabels } from '@/lib/price-tiers';

export type ShopFilterOptions = {
  categories: { slug: string; name: string; count: number }[];
  brands: { name: string; slug: string }[];
  platforms: string[];
  protocols: string[];
  priceCurrency: 'USD' | 'SRD';
};

const SORTS = ['newest', 'name', 'price-asc', 'price-desc'] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: 'Nieuwste eerst',
  name: 'Naam, A–Z',
  'price-asc': 'Prijs, laag naar hoog',
  'price-desc': 'Prijs, hoog naar laag',
};
const AVAILABILITY = ['in-stock', 'incoming'] as const;

/** One URL-state definition for the whole toolbar, so every control stays in sync. */
const queryState = {
  q: parseAsString.withDefault(''),
  category: parseAsString,
  brand: parseAsString,
  platform: parseAsString,
  protocol: parseAsString,
  new: parseAsString,
  price: parseAsString,
  availability: parseAsStringEnum([...AVAILABILITY]),
  sort: parseAsStringEnum([...SORTS]).withDefault('newest'),
  page: parseAsString,
};
const options = { shallow: false, history: 'replace' as const, throttleMs: 250 };

const selectClass =
  'h-11 appearance-none rounded-tile border border-line bg-raised pr-9 pl-3 text-[14px] text-ink focus:border-ink focus:outline-none';

/** Search, sort and availability: always visible. */
export function ShopToolbar({ filters }: { filters: ReactNode }) {
  const [state, setState] = useQueryStates(queryState, options);
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
        />
        <input
          type="search"
          value={state.q}
          onChange={(event) => setState({ q: event.target.value || null, page: null })}
          placeholder="Zoek op naam, merk of kenmerk"
          aria-label="Zoek producten"
          className="h-11 w-full rounded-tile border border-line bg-raised pr-3 pl-10 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
      </div>
      <SelectShell>
        <select
          aria-label="Beschikbaarheid"
          value={state.availability ?? ''}
          onChange={(event) =>
            setState({
              availability: (event.target.value || null) as
                | (typeof AVAILABILITY)[number]
                | null,
              page: null,
            })
          }
          className={selectClass}
        >
          <option value="">Alles</option>
          <option value="in-stock">Op voorraad</option>
          <option value="incoming">Binnenkort</option>
        </select>
      </SelectShell>
      <SelectShell>
        <select
          aria-label="Sorteren"
          value={state.sort}
          onChange={(event) => setState({ sort: event.target.value as (typeof SORTS)[number] })}
          className={selectClass}
        >
          {SORTS.map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
      </SelectShell>
      <FiltersDrawer>{filters}</FiltersDrawer>
    </div>
  );
}

function SelectShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 8"
        className="pointer-events-none absolute top-1/2 right-3 h-2 w-3 -translate-y-1/2 text-ink-3"
      >
        <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

/** Below `lg` the filter groups open in a sheet. */
function FiltersDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="nx-btn nx-btn-line h-11 lg:hidden">
          <SlidersHorizontal /> Filters
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-night/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="nx-store fixed inset-y-0 right-0 z-50 flex w-[min(92vw,400px)] flex-col bg-base text-ink shadow-overlay duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex h-16 shrink-0 items-center justify-between border-line border-b px-5">
            <Dialog.Title className="nx-label text-ink-2">Filters</Dialog.Title>
            <Dialog.Description className="sr-only">
              Beperk de producten in de winkel.
            </Dialog.Description>
            <Dialog.Close
              aria-label="Sluiten"
              className="-mr-2 grid size-10 place-items-center"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          <div className="shrink-0 border-line border-t p-4">
            <Dialog.Close className="nx-btn nx-btn-ink w-full">Toon resultaten</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Filter groups. The same component fills the desktop sidebar and the mobile sheet. */
export function ShopFilters({ data }: { data: ShopFilterOptions }) {
  const [state, setState] = useQueryStates(queryState, options);
  const priceLabels = priceTierLabels(data.priceCurrency);
  const set = (key: keyof typeof queryState, value: string | null) =>
    setState({ [key]: value, page: null });

  return (
    <div className="space-y-8">
      {data.categories.length >= 2 ? (
        <Group title="Categorie">
          <Choice active={!state.category} onClick={() => set('category', null)}>
            Alles
          </Choice>
          {data.categories.map((category) => (
            <Choice
              key={category.slug}
              active={state.category === category.slug}
              count={category.count}
              onClick={() =>
                set('category', state.category === category.slug ? null : category.slug)
              }
            >
              {category.name}
            </Choice>
          ))}
        </Group>
      ) : null}

      {data.brands.length >= 2 ? (
        <Group title="Merk">
          {data.brands.map((brand) => (
            <Choice
              key={brand.slug}
              active={state.brand === brand.slug}
              onClick={() => set('brand', state.brand === brand.slug ? null : brand.slug)}
            >
              {brand.name}
            </Choice>
          ))}
        </Group>
      ) : null}

      <Group title="Prijs">
        {PRICE_TIER_KEYS.map((key) => (
          <Choice
            key={key}
            active={state.price === key}
            onClick={() => set('price', state.price === key ? null : key)}
          >
            {priceLabels[key]}
          </Choice>
        ))}
      </Group>

      {data.platforms.length ? (
        <Group title="Werkt met">
          {data.platforms.map((platform) => (
            <Choice
              key={platform}
              active={state.platform === platform}
              onClick={() => set('platform', state.platform === platform ? null : platform)}
            >
              {platform}
            </Choice>
          ))}
        </Group>
      ) : null}

      {data.protocols.length ? (
        <Group title="Verbinding">
          {data.protocols.map((protocol) => (
            <Choice
              key={protocol}
              active={state.protocol === protocol}
              onClick={() => set('protocol', state.protocol === protocol ? null : protocol)}
            >
              {protocol}
            </Choice>
          ))}
        </Group>
      ) : null}

      <Group title="Nieuw">
        <Choice
          active={state.new === 'true'}
          onClick={() => set('new', state.new === 'true' ? null : 'true')}
        >
          Alleen nieuw
        </Choice>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="nx-label border-line border-b pb-2 text-ink-3 w-full">{title}</legend>
      <div className="mt-2 flex flex-col">{children}</div>
    </fieldset>
  );
}

function Choice({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group flex items-center justify-between gap-3 border-l-2 py-1.5 pr-1 pl-3 text-left text-[14px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        active
          ? 'border-store-bright font-semibold text-ink'
          : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink',
      )}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <span className="tabular text-[12px] text-ink-3">{count}</span>
      ) : null}
    </button>
  );
}

/** The filters currently applied, each removable, plus one "clear all". */
export function ActiveFilters({
  labels,
}: {
  labels: { category?: string; brand?: string; price?: string };
}) {
  const [state, setState] = useQueryStates(queryState, options);
  const chips: { key: keyof typeof queryState; label: string }[] = [];
  if (state.q) chips.push({ key: 'q', label: `“${state.q}”` });
  if (state.category) chips.push({ key: 'category', label: labels.category ?? state.category });
  if (state.brand) chips.push({ key: 'brand', label: labels.brand ?? state.brand });
  if (state.price) chips.push({ key: 'price', label: labels.price ?? state.price });
  if (state.platform) chips.push({ key: 'platform', label: state.platform });
  if (state.protocol) chips.push({ key: 'protocol', label: state.protocol });
  if (state.new) chips.push({ key: 'new', label: 'Nieuw' });
  if (state.availability)
    chips.push({
      key: 'availability',
      label: state.availability === 'in-stock' ? 'Op voorraad' : 'Binnenkort',
    });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => setState({ [chip.key]: null, page: null })}
          className="inline-flex h-8 items-center gap-1.5 rounded-tile bg-night px-2.5 text-[13px] text-night-ink hover:bg-night-2"
        >
          {chip.label}
          <X aria-label="Verwijder filter" className="size-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          setState({
            q: null,
            category: null,
            brand: null,
            platform: null,
            protocol: null,
            new: null,
            price: null,
            availability: null,
            page: null,
          })
        }
        className="px-1 text-[13px] font-medium text-ink underline underline-offset-4 hover:text-accent"
      >
        Alles wissen
      </button>
    </div>
  );
}
