'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Command } from 'cmdk';
import {
  ArrowRight,
  Clock,
  Fingerprint,
  Loader2,
  Plus,
  Search,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { ViewportVars } from '@/components/ui/viewport';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { QUICK_ACTIONS } from '@/lib/quick-actions';
import {
  GROUP_LABELS,
  groupHits,
  normaliseTerm,
  parseRecent,
  pushRecent,
  type RankedHit,
  type SearchKind,
} from '@/lib/search-rank';
import { searchSerialsAction } from '@/server/actions/search';
import type { SerialHit } from '@/server/queries/warranty';

/**
 * The global search and command palette (Cmd/Ctrl+K, or the field in the top bar).
 *
 * One input finds products (with photo, SKU, price and stock), customers, sales, orders, invoices,
 * suppliers, purchase orders and serial numbers, and also the quick actions and every page of the
 * dashboard. What you type is sent to the server after a short pause (staff only, a small fixed
 * number of results per kind); a newer keystroke cancels an older request, so a slow answer can never
 * replace a fresher one. Up and down keys move through everything, Enter opens it.
 *
 * Quick actions come first, then places, because the verb is usually what someone wants. The last
 * few searches are remembered on this device only. On a phone it is a full-screen sheet above the
 * keyboard.
 */

const RECENT_KEY = 'nx:recent-searches';
const DEBOUNCE_MS = 200;

const EXTRA_ACTIONS = [
  {
    href: '/items/new',
    label: 'Add a product',
    keywords: 'sku variant catalog item new product',
  },
  {
    href: '/inventory/count',
    label: 'Count stock',
    keywords: 'stocktake inventory count receive shelf',
  },
  {
    href: '/items/attention',
    label: 'Products that need attention',
    keywords: 'missing photo cost category quality problems',
  },
  {
    href: '/purchase-orders/new',
    label: 'Raise a purchase order',
    keywords: 'buy po amazon aliexpress restock',
  },
  {
    href: '/ledger?new=1',
    label: 'Record a cash movement',
    keywords: 'ledger capital contribution draw balance',
  },
] as const;

type ActionEntry = { href: string; label: string; keywords: string; hint?: string };

const ACTIONS: ActionEntry[] = [
  ...QUICK_ACTIONS.map((action) => ({
    href: action.href as string,
    label: action.label,
    keywords: action.keywords.join(' '),
    hint: action.hint,
  })),
  ...EXTRA_ACTIONS,
];

const KIND_ICON: Partial<Record<SearchKind, typeof User>> = {
  customer: User,
  supplier: Truck,
};

function matches(term: string, ...fields: (string | undefined)[]): boolean {
  const wanted = term.toLowerCase();
  const haystack = fields.join(' ').toLowerCase();
  return wanted.split(' ').every((word) => haystack.includes(word));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<RankedHit[]>([]);
  const [serialHits, setSerialHits] = useState<SerialHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Recent searches, read when the palette opens.
  useEffect(() => {
    if (!open) {
      setTerm('');
      setHits([]);
      setSerialHits([]);
      setFailed(null);
      setLoading(false);
      return;
    }
    try {
      setRecent(parseRecent(window.localStorage.getItem(RECENT_KEY)));
    } catch {
      setRecent([]);
    }
  }, [open]);

  const clean = normaliseTerm(term);

  useEffect(() => {
    if (!open) return;
    if (!clean) {
      setHits([]);
      setSerialHits([]);
      setFailed(null);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(clean)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            response.status === 401
              ? 'Your session has ended. Sign in again.'
              : (body?.error ?? 'Search is unavailable. Try again.'),
          );
        }
        const body = (await response.json()) as { hits: RankedHit[] };
        if (mine !== seq.current) return;
        setHits(body.hits);
        setFailed(null);
      } catch (error) {
        if (controller.signal.aborted || mine !== seq.current) return;
        setHits([]);
        setFailed(error instanceof Error ? error.message : 'Search is unavailable. Try again.');
      } finally {
        if (mine === seq.current) setLoading(false);
      }
      if (clean.length >= 3) {
        searchSerialsAction(clean.slice(0, 64))
          .then((found) => {
            if (mine === seq.current) setSerialHits(found);
          })
          .catch(() => {
            if (mine === seq.current) setSerialHits([]);
          });
      } else {
        setSerialHits([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [clean, open]);

  const go = useCallback(
    (href: string, remember?: string) => {
      if (remember) {
        const next = pushRecent(recent, remember);
        try {
          window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        } catch {
          // Blocked storage: the search simply is not remembered.
        }
      }
      setOpen(false);
      router.push(href as Parameters<typeof router.push>[0]);
    },
    [recent, router],
  );

  const grouped = groupHits(hits);
  const filteredActions = clean
    ? ACTIONS.filter((action) => matches(clean, action.label, action.keywords, action.hint))
    : ACTIONS;
  const filteredPages = clean
    ? ALL_NAV_ITEMS.filter((item) => matches(clean, item.label, item.keywords?.join(' ')))
    : ALL_NAV_ITEMS;
  const nothing =
    Boolean(clean) &&
    !loading &&
    !failed &&
    hits.length === 0 &&
    serialHits.length === 0 &&
    filteredActions.length === 0 &&
    filteredPages.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-11 w-full min-w-0 items-center justify-start gap-2 rounded-control border border-line bg-inset px-3 sm:h-8 sm:max-w-[280px] sm:px-2.5',
          'text-[13px] text-ink-4 transition-colors hover:border-line-strong hover:text-ink-3',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        )}
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Search or jump to</span>
        <kbd className="tabular hidden rounded-[4px] border border-line bg-raised px-1.5 py-0.5 text-[10px] text-ink-4 sm:inline">
          ⌘K
        </kbd>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              // Phone: the whole visible screen above the keyboard, so results are never hidden behind it.
              'fixed top-[var(--vv-top,0px)] left-0 z-50 h-[var(--vv-h,100dvh)] w-full',
              'sm:top-[12vh] sm:left-1/2 sm:h-auto sm:w-[min(640px,calc(100vw-2rem))] sm:-translate-x-1/2',
              'overflow-hidden bg-overlay shadow-overlay sm:rounded-card sm:border sm:border-line',
              'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out',
              'motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0',
              'motion-safe:data-[state=closed]:zoom-out-98 motion-safe:data-[state=open]:zoom-in-98',
              'motion-safe:data-[state=open]:slide-in-from-top-2 motion-safe:duration-150',
            )}
          >
            <VisuallyHidden>
              <Dialog.Title>Search</Dialog.Title>
              <Dialog.Description>
                Search products, customers, orders, invoices and suppliers, or jump to a page or
                an action
              </Dialog.Description>
            </VisuallyHidden>

            <ViewportVars />
            {/* The server does the matching for records; the palette filters actions and pages
                itself so one list of keys moves through everything in order. */}
            <Command
              loop
              shouldFilter={false}
              className="flex h-full flex-col sm:block [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:text-ink-4 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.1em]"
            >
              <div className="flex shrink-0 items-center gap-2 border-line-subtle border-b pr-1 pl-3 pt-[env(safe-area-inset-top)] sm:pt-0 sm:pr-3">
                <Search aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
                <Command.Input
                  autoFocus
                  value={term}
                  onValueChange={setTerm}
                  enterKeyHint="search"
                  placeholder="Search products, customers, orders, pages"
                  aria-label="Search"
                  className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-4 sm:h-11 sm:text-[14px]"
                />
                {loading ? (
                  <Loader2
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin text-ink-4"
                  />
                ) : null}
                {term ? (
                  <button
                    type="button"
                    aria-label="Clear the search"
                    onClick={() => setTerm('')}
                    className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:size-8"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
                <Dialog.Close
                  aria-label="Close search"
                  className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:hidden"
                >
                  <span className="text-[13px]">Cancel</span>
                </Dialog.Close>
              </div>

              <Command.List
                aria-busy={loading}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:max-h-[min(62vh,520px)]"
              >
                <p className="sr-only" aria-live="polite">
                  {loading
                    ? 'Searching'
                    : clean
                      ? `${hits.length + serialHits.length} results`
                      : ''}
                </p>

                {failed ? (
                  <p role="alert" className="px-3 py-3 text-[13px] text-negative">
                    {failed}
                  </p>
                ) : null}

                {!clean && recent.length > 0 ? (
                  <Command.Group heading="Recent searches">
                    {recent.map((entry) => (
                      <Item
                        key={entry}
                        value={`recent ${entry}`}
                        onSelect={() => setTerm(entry)}
                      >
                        <Clock aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
                        <span className="min-w-0 truncate">{entry}</span>
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                {grouped.map((group) => (
                  <Command.Group
                    key={group.kind}
                    heading={GROUP_LABELS[group.kind]}
                    className="mb-1"
                  >
                    {group.hits.map((hit) => (
                      <HitItem
                        key={`${hit.kind}-${hit.id}`}
                        hit={hit}
                        onOpen={() => go(hit.href, clean ?? undefined)}
                      />
                    ))}
                  </Command.Group>
                ))}

                {serialHits.length > 0 ? (
                  <Command.Group heading="Serial numbers" className="mb-1">
                    {serialHits.map((hit) => (
                      <Item
                        key={`${hit.saleId}-${hit.serial}`}
                        value={`serial ${hit.saleId} ${hit.serial}`}
                        onSelect={() => go(`/sales/${hit.saleId}`, clean ?? undefined)}
                      >
                        <Fingerprint
                          aria-hidden="true"
                          className="size-4 shrink-0 text-accent"
                        />
                        <span className="min-w-0 truncate">
                          <span className="tabular">{hit.serial}</span>
                          {' · '}
                          {hit.productName}
                          {hit.customerName ? ` · ${hit.customerName}` : ''}
                        </span>
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                {filteredActions.length > 0 ? (
                  <Command.Group heading="Actions" className="mb-1">
                    {filteredActions.map((action) => (
                      <Item
                        key={action.href}
                        value={`action ${action.href}`}
                        onSelect={() => go(action.href)}
                      >
                        <Plus aria-hidden="true" className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 truncate">{action.label}</span>
                        {action.hint ? (
                          <span className="ml-auto hidden truncate text-[11px] text-ink-4 sm:inline">
                            {action.hint}
                          </span>
                        ) : null}
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                {filteredPages.length > 0 ? (
                  <Command.Group heading="Go to">
                    {filteredPages.map(({ href, label, Icon }) => (
                      <Item key={href} value={`page ${href}`} onSelect={() => go(href)}>
                        <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
                        {label}
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}

                {nothing ? (
                  <p className="px-3 py-8 text-center text-[13px] text-ink-3">
                    Nothing matches &ldquo;{clean}&rdquo;. Try part of a name, a SKU, a phone
                    number or an order number.
                  </p>
                ) : null}
                {clean === null && term.trim().length === 1 ? (
                  <p className="px-3 py-2 text-[12px] text-ink-4">
                    Keep typing: two letters or more.
                  </p>
                ) : null}
              </Command.List>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function HitItem({ hit, onOpen }: { hit: RankedHit; onOpen: () => void }) {
  const Icon = KIND_ICON[hit.kind];
  return (
    <Item value={`${hit.kind} ${hit.id}`} onSelect={onOpen} tall={hit.kind === 'product'}>
      {hit.kind === 'product' ? (
        <ProductThumb src={hit.imageUrl} name={hit.title} size="sm" decorative />
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
      ) : (
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink">
          {hit.title}
          {hit.status ? (
            <span className="ml-2 text-[11px] text-ink-4">{hit.status}</span>
          ) : null}
        </span>
        {hit.subtitle ? (
          <span className="tabular block truncate text-[12px] text-ink-3">{hit.subtitle}</span>
        ) : null}
      </span>
      {hit.kind === 'product' ? (
        <span className="tabular shrink-0 text-right text-[12px] text-ink-3">
          {hit.priceCents ? (
            <span className="block text-ink">{formatMoney(hit.priceCents)}</span>
          ) : null}
          <span
            className={cn(
              hit.onHand !== null &&
                hit.onHand !== undefined &&
                hit.onHand <= 0 &&
                'text-warning',
            )}
          >
            {hit.onHand ?? 0} in stock
          </span>
        </span>
      ) : hit.totalCents !== undefined && hit.totalCents !== null ? (
        <span className="tabular shrink-0 text-[12px] text-ink">
          {formatMoney(hit.totalCents, hit.currency ?? 'USD')}
        </span>
      ) : null}
    </Item>
  );
}

function Item({
  value,
  onSelect,
  tall,
  children,
}: {
  value: string;
  onSelect: () => void;
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-control px-3 text-[14px] text-ink-2 sm:text-[13px]',
        tall ? 'min-h-14 py-1.5' : 'min-h-12 sm:min-h-9',
        'data-[selected=true]:bg-hover data-[selected=true]:text-ink',
      )}
    >
      {children}
    </Command.Item>
  );
}
