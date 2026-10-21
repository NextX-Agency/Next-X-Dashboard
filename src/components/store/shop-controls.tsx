'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { parseAsArrayOf, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs';
import { type ReactNode, startTransition, useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { pricePresets } from '@/lib/price-range';
import { swatchColour } from '@/lib/product-options';

export type ShopFilterOptions = {
  categories: { slug: string; name: string; count: number }[];
  brands: { name: string; slug: string; count?: number }[];
  platforms: string[];
  protocols: string[];
  priceCurrency: 'USD' | 'SRD';
  /** The lowest and highest public price, shown as a hint beside the range fields. */
  priceBounds?: { minCents: number; maxCents: number } | null;
  colours?: { value: string; count: number }[];
  /** Other variant options (connector, size, ...) offered because the catalogue really varies on them. */
  options?: { key: string; values: { value: string; count: number }[] }[];
  availability?: { inStock: number; incoming: number; newArrivals?: number };
};

const SORTS = ['relevance', 'newest', 'name', 'price-asc', 'price-desc'] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  relevance: 'Best match',
  newest: 'Newest first',
  name: 'Name, A–Z',
  'price-asc': 'Price, low to high',
  'price-desc': 'Price, high to low',
};
const AVAILABILITY = ['in-stock', 'incoming'] as const;

/** One URL-state definition for the whole toolbar, so every control stays in sync. */
const queryState = {
  q: parseAsString.withDefault(''),
  category: parseAsString,
  brand: parseAsArrayOf(parseAsString).withDefault([]),
  colour: parseAsArrayOf(parseAsString).withDefault([]),
  /** `key:value` pairs, e.g. connector:Type-C. */
  opt: parseAsArrayOf(parseAsString).withDefault([]),
  platform: parseAsString,
  protocol: parseAsString,
  new: parseAsString,
  /** Old fixed-tier links; read by the page, cleared whenever a range is chosen. */
  price: parseAsString,
  min: parseAsString,
  max: parseAsString,
  availability: parseAsStringEnum([...AVAILABILITY]),
  sort: parseAsStringEnum([...SORTS]),
  page: parseAsString,
};
// Each change is a history entry, so Back undoes the last filter and the address always matches the page.
const options = { shallow: false, history: 'push' as const, throttleMs: 250 };

const selectClass =
  'h-11 appearance-none rounded-[10px] border border-line-strong bg-raised pr-9 pl-3.5 font-semibold text-[14px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** How many separate filters are applied, for the badge on the Filters button. */
function activeCount(state: {
  brand: string[];
  colour: string[];
  opt: string[];
  platform: string | null;
  protocol: string | null;
  new: string | null;
  price: string | null;
  min: string | null;
  max: string | null;
}) {
  return (
    state.brand.length +
    state.colour.length +
    state.opt.length +
    (state.platform ? 1 : 0) +
    (state.protocol ? 1 : 0) +
    (state.new ? 1 : 0) +
    (state.price || state.min || state.max ? 1 : 0)
  );
}

/** Availability toggle, sort and the filters sheet. Search lives in the header. */
export function ShopToolbar({
  filters,
  inStockCount,
  total,
}: {
  filters: ReactNode;
  /** How many products match, shown beside the controls on a wide screen. */
  total?: number;
  /** Products you could see with "in stock only" on, for the label. */
  inStockCount?: number;
}) {
  const [state, setState] = useQueryStates(queryState, options);
  const onlyInStock = state.availability === 'in-stock';
  const searching = Boolean(state.q);
  const sortValue = state.sort ?? (searching ? 'relevance' : 'newest');
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <button
        type="button"
        role="switch"
        aria-checked={onlyInStock}
        onClick={() => setState({ availability: onlyInStock ? null : 'in-stock', page: null })}
        className="inline-flex h-11 items-center gap-3 font-semibold text-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          aria-hidden="true"
          className={`relative h-6 w-10 rounded-full transition-colors ${onlyInStock ? 'bg-cta' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${onlyInStock ? 'left-[18px]' : 'left-0.5'}`}
          />
        </span>
        In-stock items only
        {inStockCount !== undefined && !onlyInStock ? (
          <span className="tabular font-normal text-[13px] text-ink-3">({inStockCount})</span>
        ) : null}
      </button>
      {total !== undefined ? (
        <p
          className="tabular hidden text-[14px] text-ink-3 lg:block lg:flex-1"
          aria-live="polite"
        >
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <SelectShell>
          <select
            aria-label="Sort by"
            value={sortValue}
            onChange={(event) =>
              setState({ sort: event.target.value as (typeof SORTS)[number], page: null })
            }
            className={selectClass}
          >
            {SORTS.filter((value) => value !== 'relevance' || searching).map((value) => (
              <option key={value} value={value}>
                {SORT_LABELS[value]}
              </option>
            ))}
          </select>
        </SelectShell>
        <div className="lg:hidden">
          <FiltersDrawer count={activeCount(state)}>{filters}</FiltersDrawer>
        </div>
      </div>
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

/** The filter groups open in a side sheet. Choices apply as you tap them; "Show results" just closes it. */
function FiltersDrawer({ children, count }: { children: ReactNode; count: number }) {
  const [open, setOpen] = useState(false);
  const [, setState] = useQueryStates(queryState, options);
  return (
    // Opening mounts every filter group; a transition lets the tap paint first instead of waiting for it.
    <Dialog.Root open={open} onOpenChange={(next) => startTransition(() => setOpen(next))}>
      <Dialog.Trigger asChild>
        <button type="button" className="nx-btn nx-btn-line nx-btn-sm h-11">
          <SlidersHorizontal /> Filters
          {count > 0 ? (
            <span className="tabular grid min-w-5 place-items-center rounded-full bg-cta px-1.5 font-semibold text-[12px] text-cta-fg">
              {count}
              <span className="sr-only"> active</span>
            </span>
          ) : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-night/60 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="nx-store fixed inset-y-0 right-0 z-50 flex w-[min(92vw,400px)] flex-col bg-base text-ink shadow-overlay duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          <div className="flex h-16 shrink-0 items-center justify-between border-line border-b px-5">
            <Dialog.Title className="nx-label text-ink-2">Filters</Dialog.Title>
            <Dialog.Description className="sr-only">
              Narrow down the products in the shop. Choices apply immediately.
            </Dialog.Description>
            <Dialog.Close aria-label="Close" className="-mr-2 grid size-10 place-items-center">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          <div className="flex shrink-0 items-center gap-3 border-line border-t p-4">
            {count > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setState({
                    brand: null,
                    colour: null,
                    opt: null,
                    platform: null,
                    protocol: null,
                    new: null,
                    price: null,
                    min: null,
                    max: null,
                    availability: null,
                    page: null,
                  })
                }
                className="nx-btn nx-btn-line h-11 shrink-0"
              >
                Clear
              </button>
            ) : null}
            <Dialog.Close className="nx-btn nx-btn-primary h-11 flex-1">
              Show results
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Add or remove one value from a list-valued filter. */
function toggled(list: string[], value: string): string[] {
  const lower = value.toLowerCase();
  return list.some((item) => item.toLowerCase() === lower)
    ? list.filter((item) => item.toLowerCase() !== lower)
    : [...list, value];
}
const has = (list: string[], value: string) =>
  list.some((item) => item.toLowerCase() === value.toLowerCase());

/** Filter groups. A group appears only when the catalogue really offers a choice in it. */
export function ShopFilters({ data }: { data: ShopFilterOptions }) {
  const [state, setState] = useQueryStates(queryState, options);
  const set = (key: keyof typeof queryState, value: string | string[] | null) =>
    setState({ [key]: value, page: null });
  const list = (value: string[]) => (value.length ? value : null);

  return (
    <div className="space-y-8">
      {data.categories.length >= 2 ? (
        <Group title="Category">
          <Choice active={!state.category} onClick={() => set('category', null)}>
            All
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
        <Group title="Brand">
          {data.brands.map((brand) => (
            <Choice
              key={brand.slug}
              active={has(state.brand, brand.slug)}
              {...(brand.count !== undefined ? { count: brand.count } : {})}
              onClick={() => set('brand', list(toggled(state.brand, brand.slug)))}
            >
              {brand.name}
            </Choice>
          ))}
        </Group>
      ) : null}

      {data.colours && data.colours.length >= 2 ? (
        <Group title="Colour">
          {data.colours.map((colour) => {
            const swatch = swatchColour(colour.value);
            return (
              <Choice
                key={colour.value}
                active={has(state.colour, colour.value)}
                count={colour.count}
                onClick={() => set('colour', list(toggled(state.colour, colour.value)))}
                leading={
                  swatch ? (
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full border border-black/25"
                      style={{ backgroundColor: swatch }}
                    />
                  ) : undefined
                }
              >
                {colour.value}
              </Choice>
            );
          })}
        </Group>
      ) : null}

      {(data.options ?? []).map((group) => (
        <Group key={group.key} title={titleCase(group.key)}>
          {group.values.map((entry) => {
            const token = `${group.key}:${entry.value}`;
            return (
              <Choice
                key={token}
                active={has(state.opt, token)}
                count={entry.count}
                onClick={() => set('opt', list(toggled(state.opt, token)))}
              >
                {entry.value}
              </Choice>
            );
          })}
        </Group>
      ))}

      <PriceGroup currency={data.priceCurrency} bounds={data.priceBounds ?? null} />

      {data.platforms.length >= 2 ? (
        <Group title="Works with">
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

      {data.protocols.length >= 2 ? (
        <Group title="Connection">
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

      <Group title="Availability">
        <Choice
          active={state.availability === 'in-stock'}
          {...(data.availability ? { count: data.availability.inStock } : {})}
          onClick={() =>
            set('availability', state.availability === 'in-stock' ? null : 'in-stock')
          }
        >
          In stock
        </Choice>
        {data.availability && data.availability.incoming > 0 ? (
          <Choice
            active={state.availability === 'incoming'}
            count={data.availability.incoming}
            onClick={() =>
              set('availability', state.availability === 'incoming' ? null : 'incoming')
            }
          >
            Coming soon
          </Choice>
        ) : null}
        {state.new === 'true' || (data.availability?.newArrivals ?? 0) > 0 ? (
          <Choice
            active={state.new === 'true'}
            {...(data.availability?.newArrivals !== undefined
              ? { count: data.availability.newArrivals }
              : {})}
            onClick={() => set('new', state.new === 'true' ? null : 'true')}
          >
            New arrivals only
          </Choice>
        ) : null}
      </Group>
    </div>
  );
}

/**
 * The price range: a minimum and a maximum in the shop's currency, plus four one-tap ranges. It is applied
 * to the same option that satisfies the colour and stock filters. Typing applies on Enter or "Apply price",
 * so a half-typed number never reloads the list; the fields follow the address on Back, Forward and Clear.
 */
function PriceGroup({
  currency,
  bounds,
}: {
  currency: 'USD' | 'SRD';
  bounds: { minCents: number; maxCents: number } | null;
}) {
  const [state, setState] = useQueryStates(queryState, options);
  const [min, setMin] = useState(state.min ?? '');
  const [max, setMax] = useState(state.max ?? '');
  useEffect(() => {
    setMin(state.min ?? '');
    setMax(state.max ?? '');
  }, [state.min, state.max]);
  const symbol = currency === 'SRD' ? 'SRD' : 'US$';
  const apply = (nextMin: string | null, nextMax: string | null) =>
    setState({
      min: nextMin?.trim() || null,
      max: nextMax?.trim() || null,
      price: null,
      page: null,
    });
  const hint = (cents: number) => Math.round(cents / 100).toLocaleString('en-GB');
  const field =
    'tabular mt-1 h-11 w-full min-w-0 rounded-[10px] border border-line-strong bg-raised px-3 text-[14px] text-ink placeholder:text-ink-4 focus:border-accent focus:outline-none';
  const isPreset = (presetMin: string | null, presetMax: string | null) =>
    (state.min ?? null) === presetMin && (state.max ?? null) === presetMax;

  return (
    <fieldset>
      <legend className="nx-label border-line border-b pb-2 text-ink-3 w-full">
        Price ({symbol})
      </legend>
      <form
        className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply(min, max);
        }}
      >
        <label className="block text-[12px] text-ink-3">
          Min
          <input
            inputMode="decimal"
            autoComplete="off"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            placeholder={bounds ? hint(bounds.minCents) : '0'}
            className={field}
          />
        </label>
        <span aria-hidden="true" className="pb-3 text-ink-3">
          –
        </span>
        <label className="block text-[12px] text-ink-3">
          Max
          <input
            inputMode="decimal"
            autoComplete="off"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            placeholder={bounds ? hint(bounds.maxCents) : ''}
            className={field}
          />
        </label>
        <button type="submit" className="nx-btn nx-btn-line nx-btn-sm col-span-3 h-10">
          Apply price
        </button>
      </form>
      <div className="mt-2 flex flex-col">
        {pricePresets(currency).map((preset) => (
          <Choice
            key={preset.key}
            active={isPreset(preset.min, preset.max)}
            onClick={() =>
              isPreset(preset.min, preset.max)
                ? apply(null, null)
                : apply(preset.min, preset.max)
            }
          >
            {preset.label}
          </Choice>
        ))}
      </div>
    </fieldset>
  );
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

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
  leading,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  leading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'group flex min-h-10 items-center justify-between gap-3 border-l-2 py-1.5 pr-1 pl-3 text-left text-[14px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        active
          ? 'border-store-bright font-semibold text-accent'
          : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink',
        count === 0 && !active && 'text-ink-4',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {leading}
        <span className="truncate">{children}</span>
        {active ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      </span>
      {count !== undefined ? (
        <span className="tabular text-[12px] text-ink-3">
          {count}
          <span className="sr-only"> products</span>
        </span>
      ) : null}
    </button>
  );
}

/** The filters currently applied, each removable, plus one "clear all". */
export function ActiveFilters({
  labels,
}: {
  labels: { category?: string; brands?: Record<string, string>; price?: string };
}) {
  const [state, setState] = useQueryStates(queryState, options);
  const chips: { id: string; label: string; remove: () => void }[] = [];
  const clear = (patch: Record<string, string | string[] | null>) => () =>
    setState({ ...patch, page: null } as Parameters<typeof setState>[0]);

  if (state.q) chips.push({ id: 'q', label: `“${state.q}”`, remove: clear({ q: null }) });
  if (state.category)
    chips.push({
      id: 'category',
      label: labels.category ?? state.category,
      remove: clear({ category: null }),
    });
  for (const brand of state.brand) {
    chips.push({
      id: `brand:${brand}`,
      label: labels.brands?.[brand] ?? brand,
      remove: clear({ brand: state.brand.filter((item) => item !== brand) }),
    });
  }
  for (const colour of state.colour) {
    chips.push({
      id: `colour:${colour}`,
      label: colour,
      remove: clear({ colour: state.colour.filter((item) => item !== colour) }),
    });
  }
  for (const token of state.opt) {
    chips.push({
      id: `opt:${token}`,
      label: token.includes(':') ? token.slice(token.indexOf(':') + 1) : token,
      remove: clear({ opt: state.opt.filter((item) => item !== token) }),
    });
  }
  if (state.price || state.min || state.max)
    chips.push({
      id: 'price',
      label: labels.price ?? 'Price',
      remove: clear({ price: null, min: null, max: null }),
    });
  if (state.platform)
    chips.push({ id: 'platform', label: state.platform, remove: clear({ platform: null }) });
  if (state.protocol)
    chips.push({ id: 'protocol', label: state.protocol, remove: clear({ protocol: null }) });
  if (state.new) chips.push({ id: 'new', label: 'New', remove: clear({ new: null }) });
  if (state.availability)
    chips.push({
      id: 'availability',
      label: state.availability === 'in-stock' ? 'In stock' : 'Coming soon',
      remove: clear({ availability: null }),
    });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          aria-label={`Remove filter: ${chip.label}`}
          onClick={chip.remove}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cta px-3.5 font-semibold text-[13px] text-cta-fg hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {chip.label}
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          setState({
            q: null,
            category: null,
            brand: null,
            colour: null,
            opt: null,
            platform: null,
            protocol: null,
            new: null,
            price: null,
            min: null,
            max: null,
            availability: null,
            sort: null,
            page: null,
          })
        }
        className="min-h-9 px-1 text-[13px] font-medium text-ink underline underline-offset-4 hover:text-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        Clear all
      </button>
    </div>
  );
}

/** Progressive loading: the page shows a step of products; this adds the next step and keeps the filters. */
export function ShowMore({ shown, total }: { shown: number; total: number }) {
  const [state, setState] = useQueryStates({ page: parseAsString }, options);
  const next = (Number.parseInt(state.page ?? '1', 10) || 1) + 1;
  return (
    <div className="mt-8 flex flex-col items-center gap-2">
      <p className="tabular text-[13px] text-ink-3">
        Showing {shown} of {total}
      </p>
      <button
        type="button"
        onClick={() => setState({ page: String(next) })}
        className="nx-btn nx-btn-line px-8"
      >
        Show more
      </button>
    </div>
  );
}
