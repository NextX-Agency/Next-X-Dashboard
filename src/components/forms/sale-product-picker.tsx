'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowLeft,
  Boxes,
  Check,
  LayoutGrid,
  List,
  Minus,
  Package,
  Plus,
  Search,
  X,
} from 'lucide-react';
import Image from 'next/image';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { fromBase, type RateMicros } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import {
  filterProducts,
  groupByProduct,
  optionLabel,
  type PickerProduct,
  type PickerStockFilter,
  stockLabel,
} from '@/lib/sale-picker';
import type { BundleOption, SaleVariantOption } from '@/server/queries/pickers';

/**
 * The visual product browser for "Record a sale".
 *
 * It only chooses: a variant id (or a bundle id) and a quantity. Prices, cost of goods, stock moves
 * and the ledger are still decided by the sale form and the server action, exactly as before.
 * In "add" mode the dialog stays open after each addition so a basket of several products is one
 * continuous flow; in "replace" mode it swaps the product on one line and closes.
 */

export type PickerSelection =
  | { kind: 'variant'; variantId: string; quantity: number }
  | { kind: 'bundle'; bundleId: string; quantity: number };

const PAGE_SIZE = 48;

type View = 'grid' | 'list';

export function SaleProductPicker({
  open,
  onOpenChange,
  mode,
  variants,
  bundles,
  currency,
  rateMicros,
  inSale,
  lineCount,
  returnFocusTo,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'replace';
  variants: SaleVariantOption[];
  bundles: BundleOption[];
  currency: 'USD' | 'SRD';
  rateMicros: RateMicros;
  /** Quantity already in the sale per variant, to show "2 in sale" on cards. */
  inSale: ReadonlyMap<string, number>;
  lineCount: number;
  /** What opened the dialog, so keyboard users land back where they were when it closes. */
  returnFocusTo?: RefObject<HTMLElement | null>;
  onChoose: (selection: PickerSelection) => void;
}) {
  const products = useMemo(() => groupByProduct(variants), [variants]);
  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.categoryName).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b)),
      ) as string[],
    [products],
  );

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string | null>(null);
  const [stock, setStock] = useState<PickerStockFilter>('all');
  const [view, setView] = useState<View>('grid');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsId = useId();

  const filtered = useMemo(
    () => filterProducts(products, { query: deferredQuery, category, stock }),
    [products, deferredQuery, category, stock],
  );
  const matchingBundles = useMemo(() => {
    if (category || stock === 'out') return [];
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return bundles.filter((bundle) => {
      if (stock === 'in-stock' && bundle.availability <= 0) return false;
      const hay = `${bundle.name} ${bundle.sku} bundle`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [bundles, deferredQuery, category, stock]);

  const shown = filtered.slice(0, limit);
  const product =
    selected && !selected.startsWith('bundle:')
      ? products.find((entry) => entry.productId === selected)
      : undefined;
  const bundle = selected?.startsWith('bundle:')
    ? bundles.find((entry) => entry.id === selected.slice(7))
    : undefined;
  const variant = product
    ? (product.variants.find((entry) => entry.id === variantId) ?? product.variants[0])
    : undefined;

  const money = (cents: number) =>
    formatMoney(currency === 'SRD' ? fromBase(cents, rateMicros) : cents, currency);

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSelected(null);
      setVariantId(null);
      setQuantity('1');
      setJustAdded(null);
    }
  }

  function openProduct(entry: PickerProduct) {
    setSelected(entry.productId);
    const firstSellable =
      entry.variants.find((candidate) => candidate.isActive && candidate.onHand > 0) ??
      entry.variants.find((candidate) => candidate.isActive) ??
      entry.variants[0];
    setVariantId(firstSellable?.id ?? null);
    setQuantity('1');
    setJustAdded(null);
    // One option: the next keystroke is the quantity, then Enter adds it.
    if (entry.variants.length === 1) {
      requestAnimationFrame(() => {
        const field = document.getElementById('picker-quantity');
        field?.focus();
      });
    }
  }

  function openBundle(entry: BundleOption) {
    setSelected(`bundle:${entry.id}`);
    setVariantId(null);
    setQuantity('1');
    setJustAdded(null);
  }

  const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 0);

  function commit() {
    if (bundle) {
      onChoose({ kind: 'bundle', bundleId: bundle.id, quantity: parsedQuantity });
      setJustAdded(`${parsedQuantity} × ${bundle.name}`);
    } else if (variant?.isActive) {
      onChoose({ kind: 'variant', variantId: variant.id, quantity: parsedQuantity });
      const label = optionLabel(variant);
      setJustAdded(`${parsedQuantity} × ${variant.productName}${label ? ` – ${label}` : ''}`);
    } else {
      return;
    }
    if (mode === 'replace') {
      reset(false);
      return;
    }
    setQuantity('1');
    setSelected(null);
    // Back to the search box: the next product is one keystroke away.
    queueMicrotask(() => searchRef.current?.select());
  }

  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(event.key)) return;
    const cards = [
      ...(listRef.current?.querySelectorAll<HTMLElement>('[data-picker-card]') ?? []),
    ];
    const index = cards.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    if (!forward && index === 0) {
      searchRef.current?.focus();
      return;
    }
    cards[Math.max(0, Math.min(cards.length - 1, index + (forward ? 1 : -1)))]?.focus();
  }

  const anyFilter = Boolean(query || category || stock !== 'all');
  const resultCount = filtered.length + matchingBundles.length;
  const detailOpen = Boolean(product || bundle);

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (!returnFocusTo?.current) return;
            event.preventDefault();
            returnFocusTo.current.focus();
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
          className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-card border border-line-subtle bg-base shadow-overlay sm:inset-6 lg:inset-x-[6%] lg:inset-y-8"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-line-subtle border-b px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="font-medium text-[15px] text-ink tracking-[-0.01em]">
                {mode === 'replace' ? 'Change product' : 'Add products to this sale'}
              </Dialog.Title>
              <p className="text-[12px] text-ink-3">
                Search by name, model, brand or SKU. Prices shown in {currency}.
              </p>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <X className="size-4" />
            </Dialog.Close>
          </header>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-line-subtle border-b px-4 py-3">
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Search products</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4"
              />
              <input
                ref={searchRef}
                type="search"
                autoComplete="off"
                spellCheck={false}
                value={query}
                placeholder="Search name, model, brand or SKU"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(PAGE_SIZE);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    listRef.current?.querySelector<HTMLElement>('[data-picker-card]')?.focus();
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const first = shown[0];
                    // A second Enter on a single-option product adds one: search, Enter, Enter.
                    if (first && selected === first.productId && first.variants.length === 1)
                      commit();
                    else if (first) openProduct(first);
                    else if (matchingBundles[0]) openBundle(matchingBundles[0]);
                  }
                }}
                aria-controls={resultsId}
                className="h-10 w-full rounded-control border border-line bg-inset pr-3 pl-9 text-[14px] text-ink placeholder:text-ink-4 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
              />
            </label>

            {categories.length > 0 ? (
              <label>
                <span className="sr-only">Category</span>
                <select
                  value={category ?? ''}
                  onChange={(event) => {
                    setCategory(event.target.value || null);
                    setLimit(PAGE_SIZE);
                  }}
                  className="h-10 rounded-control border border-line bg-inset px-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <option value="">All categories</option>
                  {categories.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <fieldset className="flex overflow-hidden rounded-control border border-line">
              <legend className="sr-only">Stock</legend>
              {(
                [
                  ['all', 'All'],
                  ['in-stock', 'In stock'],
                  ['out', 'Out of stock'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={stock === value}
                  onClick={() => {
                    setStock(value);
                    setLimit(PAGE_SIZE);
                  }}
                  className={cn(
                    'h-10 px-3 text-[13px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    stock === value
                      ? 'bg-accent-muted font-medium text-accent'
                      : 'text-ink-2 hover:bg-hover',
                  )}
                >
                  {label}
                </button>
              ))}
            </fieldset>

            <fieldset className="flex overflow-hidden rounded-control border border-line">
              <legend className="sr-only">View</legend>
              {(
                [
                  ['grid', 'Photo grid', LayoutGrid],
                  ['list', 'Compact list', List],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  aria-label={label}
                  title={label}
                  onClick={() => setView(value)}
                  className={cn(
                    'grid size-10 place-items-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    view === value
                      ? 'bg-accent-muted text-accent'
                      : 'text-ink-3 hover:bg-hover',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </fieldset>
          </div>

          <div className="flex min-h-0 flex-1">
            <div
              ref={listRef}
              id={resultsId}
              className={cn(
                'min-h-0 min-w-0 flex-1 overflow-y-auto p-4',
                detailOpen && 'max-md:hidden',
              )}
            >
              <p aria-live="polite" className="mb-3 text-[12px] text-ink-3">
                {resultCount} {resultCount === 1 ? 'result' : 'results'}
                {anyFilter ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="text-accent underline-offset-2 hover:underline"
                      onClick={() => {
                        setQuery('');
                        setCategory(null);
                        setStock('all');
                        searchRef.current?.focus();
                      }}
                    >
                      Clear filters
                    </button>
                  </>
                ) : null}
              </p>

              {resultCount === 0 ? (
                <div className="grid place-items-center gap-2 py-16 text-center">
                  <Package aria-hidden="true" className="size-8 text-ink-4" />
                  <p className="font-medium text-[14px] text-ink">
                    {products.length === 0 ? 'No products yet' : 'No products match'}
                  </p>
                  <p className="max-w-[40ch] text-[13px] text-ink-3">
                    {products.length === 0
                      ? 'Add a product under Products first, then it will appear here.'
                      : 'Try a shorter search, another category, or clear the filters.'}
                  </p>
                </div>
              ) : (
                <ul
                  className={cn(
                    view === 'grid'
                      ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
                      : 'divide-y divide-line-subtle rounded-card border border-line-subtle',
                  )}
                >
                  {shown.map((entry) => {
                    const addedQty = entry.variants.reduce(
                      (sum, candidate) => sum + (inSale.get(candidate.id) ?? 0),
                      0,
                    );
                    return (
                      <li key={entry.productId}>
                        <ProductCard
                          view={view}
                          selected={selected === entry.productId}
                          name={entry.name}
                          image={entry.image}
                          meta={[entry.brandName, entry.categoryName]}
                          model={entry.modelNumber}
                          options={entry.variants.length > 1 ? entry.variants.length : 0}
                          price={
                            entry.minPriceCents === entry.maxPriceCents
                              ? money(entry.minPriceCents)
                              : `from ${money(entry.minPriceCents)}`
                          }
                          onHand={entry.onHand}
                          inSale={addedQty}
                          sku={entry.variants.length === 1 ? entry.variants[0]?.sku : undefined}
                          onSelect={() => openProduct(entry)}
                          onKeyDown={moveFocus}
                        />
                      </li>
                    );
                  })}
                  {matchingBundles.map((entry) => (
                    <li key={entry.id}>
                      <ProductCard
                        view={view}
                        selected={selected === `bundle:${entry.id}`}
                        name={entry.name}
                        image={null}
                        bundle
                        meta={['Bundle']}
                        model={null}
                        options={0}
                        price={money(entry.priceCents)}
                        onHand={entry.availability}
                        inSale={0}
                        sku={entry.sku}
                        onSelect={() => openBundle(entry)}
                        onKeyDown={moveFocus}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {filtered.length > shown.length ? (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setLimit((current) => current + PAGE_SIZE)}
                    className="h-9 rounded-control border border-line px-4 text-[13px] text-ink-2 hover:bg-hover"
                  >
                    Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more of{' '}
                    {filtered.length - shown.length}
                  </button>
                </div>
              ) : null}
            </div>

            {detailOpen ? (
              <aside
                aria-label="Selected product"
                className="flex min-h-0 w-full shrink-0 flex-col border-line-subtle bg-inset md:w-[380px] md:border-l"
              >
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="mb-2 -ml-2 inline-flex h-11 items-center gap-1 px-2 text-[13px] text-ink-3 hover:text-ink md:hidden"
                  >
                    <ArrowLeft className="size-3.5" /> Back to results
                  </button>
                  {product && variant ? (
                    <ProductDetail
                      product={product}
                      variant={variant}
                      money={money}
                      onPick={(id) => {
                        setVariantId(id);
                        setJustAdded(null);
                      }}
                      inSale={inSale}
                    />
                  ) : bundle ? (
                    <BundleDetail bundle={bundle} money={money} />
                  ) : null}
                </div>

                <div className="shrink-0 space-y-2 border-line-subtle border-t bg-base p-4">
                  <QuantityOverstockNote
                    quantity={parsedQuantity}
                    onHand={bundle ? bundle.availability : (variant?.onHand ?? 0)}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex h-11 shrink-0 items-stretch rounded-control border border-line">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={parsedQuantity <= 1}
                        onClick={() => setQuantity(String(Math.max(1, parsedQuantity - 1)))}
                        className="grid w-11 place-items-center rounded-l-control hover:bg-hover disabled:opacity-35"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <label className="sr-only" htmlFor="picker-quantity">
                        Quantity
                      </label>
                      <input
                        id="picker-quantity"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                          }
                        }}
                        className="tabular w-12 border-0 bg-transparent text-center text-[14px] text-ink focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setQuantity(String(parsedQuantity + 1))}
                        className="grid w-11 place-items-center rounded-r-control hover:bg-hover"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={commit}
                      disabled={Boolean(variant && !variant.isActive)}
                      className="h-11 flex-1 rounded-control bg-accent px-4 font-medium text-[13px] text-accent-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                    >
                      {mode === 'replace' ? 'Use this product' : 'Add to sale'}
                    </button>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-line-subtle border-t bg-inset px-4 py-3">
            <p
              aria-live="polite"
              className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3"
            >
              {justAdded ? (
                <>
                  <Check aria-hidden="true" className="size-3.5 shrink-0 text-positive" />
                  <span className="truncate text-ink">Added {justAdded}</span>
                </>
              ) : (
                <span>
                  {lineCount} {lineCount === 1 ? 'line' : 'lines'} in this sale
                </span>
              )}
            </p>
            <Dialog.Close className="h-11 shrink-0 rounded-control border border-line bg-base px-5 text-[13px] text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring">
              {mode === 'replace' ? 'Cancel' : 'Done'}
            </Dialog.Close>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Thumb({
  image,
  name,
  size,
  bundle,
}: {
  image: SaleVariantOption['image'];
  name: string;
  size: number;
  bundle?: boolean;
}) {
  const Icon = bundle ? Boxes : Package;
  return (
    <div className="relative size-full overflow-hidden rounded-control bg-white">
      {image ? (
        <Image
          src={image.url}
          alt={image.alt ?? name}
          fill
          sizes={`${size}px`}
          className="object-contain p-1"
        />
      ) : (
        <div className="grid size-full place-items-center">
          <Icon aria-hidden="true" className="size-1/3 text-ink-4" />
          <span className="sr-only">No photo</span>
        </div>
      )}
    </div>
  );
}

function StockText({ onHand }: { onHand: number }) {
  const label = stockLabel(onHand);
  return (
    <span
      className={cn(
        'tabular text-[12px]',
        label.tone === 'ok' && 'text-positive',
        label.tone === 'low' && 'text-warning',
        label.tone === 'out' && 'text-ink-4',
        label.tone === 'over' && 'text-negative',
      )}
    >
      {label.text}
    </span>
  );
}

function ProductCard({
  view,
  selected,
  name,
  image,
  meta,
  model,
  options,
  price,
  onHand,
  inSale,
  sku,
  bundle,
  onSelect,
  onKeyDown,
}: {
  view: View;
  selected: boolean;
  name: string;
  image: SaleVariantOption['image'];
  meta: (string | null)[];
  model: string | null;
  options: number;
  price: string;
  onHand: number;
  inSale: number;
  sku?: string | undefined;
  bundle?: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const context = meta.filter(Boolean).join(' · ');
  const label = [
    name,
    context,
    model ? `model ${model}` : null,
    options ? `${options} options` : null,
    price,
    stockLabel(onHand).text,
    inSale ? `${inSale} already in sale` : null,
  ]
    .filter(Boolean)
    .join(', ');

  if (view === 'list') {
    return (
      <button
        type="button"
        data-picker-card
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          selected && 'bg-accent-muted/50',
        )}
      >
        <div className="size-10 shrink-0">
          <Thumb image={image} name={name} size={40} {...(bundle ? { bundle } : {})} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{name}</p>
          <p className="truncate text-[11px] text-ink-3">
            {[context, model, sku, options ? `${options} options` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[13px] text-ink">{price}</p>
          <StockText onHand={onHand} />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-picker-card
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-full w-full flex-col overflow-hidden rounded-card border bg-base text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected
          ? 'border-accent ring-2 ring-accent/40'
          : 'border-line-subtle hover:border-line-strong',
      )}
    >
      <div className="aspect-square w-full p-1.5">
        <Thumb image={image} name={name} size={220} {...(bundle ? { bundle } : {})} />
      </div>
      {inSale > 0 ? (
        <span className="absolute top-2 left-2 rounded-control bg-accent px-1.5 py-0.5 font-medium text-[11px] text-accent-ink">
          {inSale} in sale
        </span>
      ) : null}
      <div className="flex flex-1 flex-col gap-0.5 p-2.5 pt-1">
        <p className="line-clamp-2 min-h-[2.5em] text-[13px] text-ink leading-tight">{name}</p>
        <p className="truncate text-[11px] text-ink-3">{context || ' '}</p>
        <p className="truncate text-[11px] text-ink-4">
          {[model, options ? `${options} options` : sku].filter(Boolean).join(' · ') || ' '}
        </p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1.5">
          <span className="tabular text-[13px] text-ink">{price}</span>
          <StockText onHand={onHand} />
        </div>
      </div>
    </button>
  );
}

function ProductDetail({
  product,
  variant,
  money,
  onPick,
  inSale,
}: {
  product: PickerProduct;
  variant: SaleVariantOption;
  money: (cents: number) => string;
  onPick: (variantId: string) => void;
  inSale: ReadonlyMap<string, number>;
}) {
  const label = optionLabel(variant);
  const many = product.variants.length > 1;
  return (
    <div className="space-y-4">
      <div className="mx-auto aspect-square w-full max-w-[260px]">
        <Thumb
          image={variant.image}
          name={`${product.name}${label ? ` – ${label}` : ''}`}
          size={260}
        />
      </div>
      <div>
        <h3 className="font-medium text-[15px] text-ink leading-snug">{product.name}</h3>
        <p className="text-[12px] text-ink-3">
          {[product.brandName, product.categoryName].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-[12px] text-ink-3">
          {[product.modelNumber ? `Model ${product.modelNumber}` : null, `SKU ${variant.sku}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular text-[20px] text-ink">{money(variant.listPriceCents)}</span>
        <StockText onHand={variant.onHand} />
      </div>

      {variant.locations.length > 0 ? (
        <ul aria-label="Stock by location" className="space-y-1 text-[12px]">
          {variant.locations.map((location) => (
            <li key={location.id} className="flex justify-between gap-3 text-ink-3">
              <span className="truncate">{location.name}</span>
              <span className="tabular text-ink-2">{location.onHand}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {many ? (
        <fieldset>
          <legend className="mb-1.5 font-medium text-[12px] text-ink-2">
            Choose an option ({product.variants.length})
          </legend>
          <ul className="space-y-1.5">
            {product.variants.map((candidate) => {
              const chosen = candidate.id === variant.id;
              const optionName = optionLabel(candidate) ?? candidate.sku;
              const qty = inSale.get(candidate.id) ?? 0;
              return (
                <li key={candidate.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    disabled={!candidate.isActive}
                    onClick={() => onPick(candidate.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-control border bg-base p-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-45',
                      chosen
                        ? 'border-accent ring-1 ring-accent/50'
                        : 'border-line hover:bg-hover',
                    )}
                  >
                    <div className="size-11 shrink-0">
                      <Thumb
                        image={candidate.image}
                        name={`${product.name} – ${optionName}`}
                        size={44}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">
                        {optionName}
                        {chosen ? <span className="sr-only"> (selected)</span> : null}
                      </p>
                      <p className="truncate text-[11px] text-ink-3">
                        {candidate.sku}
                        {!candidate.isActive ? ' · inactive' : ''}
                        {qty ? ` · ${qty} in sale` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[12px] text-ink">
                        {money(candidate.listPriceCents)}
                      </p>
                      <StockText onHand={candidate.onHand} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
    </div>
  );
}

function BundleDetail({
  bundle,
  money,
}: {
  bundle: BundleOption;
  money: (cents: number) => string;
}): ReactNode {
  return (
    <div className="space-y-4">
      <div className="mx-auto aspect-square w-full max-w-[200px]">
        <Thumb image={null} name={bundle.name} size={200} bundle />
      </div>
      <div>
        <h3 className="font-medium text-[15px] text-ink">{bundle.name}</h3>
        <p className="text-[12px] text-ink-3">Bundle · SKU {bundle.sku}</p>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular text-[20px] text-ink">{money(bundle.priceCents)}</span>
        <StockText onHand={bundle.availability} />
      </div>
      <ul aria-label="Bundle contents" className="space-y-1 text-[12px] text-ink-2">
        {bundle.components.map((component) => (
          <li key={component.variantId} className="flex justify-between gap-3">
            <span className="truncate">
              {component.productName}
              {optionLabel({ variantName: component.variantName, attributes: {} })
                ? ` – ${component.variantName}`
                : ''}
            </span>
            <span className="tabular text-ink-3">× {component.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuantityOverstockNote({ quantity, onHand }: { quantity: number; onHand: number }) {
  if (quantity <= Math.max(onHand, 0)) return null;
  return (
    <p className="text-[11px] text-warning">
      Only {Math.max(onHand, 0)} on hand. The sale will still record, and the shortfall will be
      flagged.
    </p>
  );
}
