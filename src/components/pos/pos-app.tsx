'use client';

import { Camera, PauseCircle, Search, ShoppingBasket, WifiOff, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMember } from '@/components/providers/member-provider';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useMediaQuery, ViewportVars } from '@/components/ui/viewport';
import { businessDateInput } from '@/lib/business-date';
import { cn } from '@/lib/cn';
import { describeIssues } from '@/lib/form-issues';
import { formatDate, formatDateShort } from '@/lib/format';
import { formatRate, isRateStale, RATE_SCALE } from '@/lib/fx';
import { type CurrencyCode, toDecimalString } from '@/lib/money';
import {
  addToCart,
  type Cart,
  cartBlocker,
  cartFingerprint,
  computeTotals,
  type DiscountInput,
  emptyCart,
  listPriceIn,
  mergeCarts,
  newUuid,
  reconcileCart,
  removeLine,
  restoreLine,
  saleNotes,
  setCurrency,
  setLineNote,
  setOverride,
  setQuantity,
} from '@/lib/pos/cart';
import { categoryChips, filterProducts, groupProducts, sellableLabel } from '@/lib/pos/catalog';
import { buildCodeIndex, resolveEntry } from '@/lib/pos/entry';
import { describeSaleError, type SaleError } from '@/lib/pos/errors';
import { formatPos } from '@/lib/pos/format';
import { marginMessage, orderMargin } from '@/lib/pos/margin';
import { methodForWallet, parseReceived, planSettlement, walletsFor } from '@/lib/pos/payment';
import { buildReceiptText, type ReceiptInput, receiptWhatsappUrl } from '@/lib/pos/receipt';
import { pickDefaultSeller, type SellerChoice } from '@/lib/pos/seller';
import {
  browserStorage,
  loadCart,
  loadList,
  loadParked,
  MAX_PARKED,
  type ParkedCart,
  POS_KEYS,
  parkCart,
  pushRecent,
  removeParked,
  resumeParked,
  type StorageLike,
  saveCart,
  saveList,
  saveParked,
  toggleFavourite,
} from '@/lib/pos/storage';
import type { PosCustomer, PosProduct, Sellable } from '@/lib/pos/types';
import { undoAllowed, undoMinutesLeft } from '@/lib/pos/undo';
import { describeReservedConflict, reservedStockConflicts } from '@/lib/reserved-stock';
import { saleSchema } from '@/lib/schemas';
import { createPublicInvoiceLink } from '@/server/actions/invoices';
import { undoRecentSale } from '@/server/actions/pos';
import { createSale } from '@/server/actions/sales';
import type { WalletChoice } from '@/server/queries/pickers';
import { CartView } from './cart-view';
import { CustomerSheet } from './customer-sheet';
import { type DoneSale, DoneView } from './done-view';
import { useCanScan, useNow, useOnline } from './hooks';
import { ParkedSheet } from './parked-sheet';
import { PayView } from './pay-view';
import { MiniCard, ProductTile, priceRange } from './product-tiles';
import { ScannerSheet } from './scanner';
import { TodayView } from './today-view';
import { VariantSheet } from './variant-sheet';
import './pos.css';

type Step = 'cart' | 'pay' | 'done';

export type PosAppProps = {
  catalog: Sellable[];
  customers: PosCustomer[];
  sellers: SellerChoice[];
  wallets: WalletChoice[];
  /** Null when no exchange rate has been entered yet: the counter then sells in USD only. */
  rateMicros: number | null;
  rateEffectiveFrom: string | null;
  businessName: string;
  memberId: string;
};

type LastSale = DoneSale & {
  createdAtMs: number;
  receipt: Omit<ReceiptInput, 'invoiceUrl'>;
  customerPhone: string | null;
};

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Paramaribo',
  hour: '2-digit',
  minute: '2-digit',
});

const searchClass =
  'h-11 w-full min-w-0 rounded-control border border-line bg-raised pr-20 pl-9 text-[16px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

/**
 * The counter. One screen to pick, price, take payment and hand over a receipt.
 *
 * State lives here and nowhere else: the cart (kept on this device after every change), the parked
 * carts, the recent and favourite items. All arithmetic is in `lib/pos/*` and is unit-tested; all
 * money is booked by the existing `createSale` action, so a sale from here is the same sale, with the
 * same stock, cost, commission and ledger rules, as one from the full form.
 */
export function PosApp({
  catalog,
  customers: initialCustomers,
  sellers,
  wallets,
  rateMicros: rateOrNull,
  rateEffectiveFrom,
  businessName,
  memberId,
}: PosAppProps) {
  const router = useRouter();
  const { fullName, role } = useMember();
  const online = useOnline();
  const canScan = useCanScan();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const canWrite = role !== 'viewer';
  const hasRate = rateOrNull !== null && rateOrNull > 0;
  const rate = hasRate ? (rateOrNull as number) : RATE_SCALE;

  /* ── Catalogue ── */
  const sellableByKey = useMemo(
    () => new Map(catalog.map((sellable) => [sellable.key, sellable])),
    [catalog],
  );
  const lookup = useCallback((key: string) => sellableByKey.get(key), [sellableByKey]);
  const products = useMemo(() => groupProducts(catalog), [catalog]);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const codeIndex = useMemo(() => buildCodeIndex(catalog), [catalog]);
  const categories = useMemo(() => categoryChips(products), [products]);
  const positions = useMemo(
    () =>
      new Map(
        catalog
          .filter((sellable) => sellable.kind === 'variant')
          .map((sellable) => [
            sellable.variantId,
            { onHand: sellable.onHand, reserved: sellable.reserved },
          ]),
      ),
    [catalog],
  );

  /* ── State ── */
  const [cart, setCart] = useState<Cart>(() => emptyCart(hasRate ? 'SRD' : 'USD'));
  const [hydrated, setHydrated] = useState(false);
  const storageRef = useRef<StorageLike | null>(null);
  const [parked, setParked] = useState<ParkedCart[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [customers, setCustomers] = useState(initialCustomers);

  const [view, setView] = useState<'sell' | 'today'>('sell');
  const [step, setStep] = useState<Step>('cart');
  const [panelOpen, setPanelOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState<string | null>(null);
  const [variantFor, setVariantFor] = useState<PosProduct | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [parkLabelHint, setParkLabelHint] = useState('Cart');

  const [walletChoice, setWalletChoice] = useState<string | null>(null);
  const [received, setReceived] = useState('');
  const [onAccount, setOnAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<SaleError | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<{ fingerprint: string; label: string } | null>(
    null,
  );
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const barButtonRef = useRef<HTMLButtonElement | null>(null);
  const freshTimer = useRef<number | undefined>(undefined);
  const announceCount = useRef(0);

  const announce = useCallback((text: string) => {
    announceCount.current += 1;
    // A trailing zero-width space makes the same sentence count as new text, so a repeat is read out.
    setAnnouncement(announceCount.current % 2 === 0 ? text : `${text}​`);
  }, []);

  /* ── Restore from this device, once ── */
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once on mount.
  useEffect(() => {
    const storage = browserStorage();
    storageRef.current = storage;
    const restored = loadCart(storage);
    const rememberedSeller = (() => {
      try {
        return window.localStorage.getItem('nextx.lastSeller');
      } catch {
        return null;
      }
    })();
    const defaultSeller = pickDefaultSeller(sellers, fullName, rememberedSeller);
    if (restored) {
      const { cart: kept, dropped } = reconcileCart(restored, lookup);
      const savedCart: Cart = {
        ...kept,
        customerId: initialCustomers.some((c) => c.id === kept.customerId)
          ? kept.customerId
          : null,
        sellerId: sellers.some((s) => s.id === kept.sellerId && s.active)
          ? kept.sellerId
          : defaultSeller,
      };
      // Whatever was tapped before this ran is added to the saved cart, not thrown away.
      setCart((current) => mergeCarts(savedCart, current));
      if (dropped > 0) {
        toast.info(
          `${dropped} item${dropped === 1 ? '' : 's'} in the saved cart ${dropped === 1 ? 'is' : 'are'} no longer sold and ${dropped === 1 ? 'was' : 'were'} removed.`,
        );
      }
    } else {
      setCart((current) => ({ ...current, sellerId: defaultSeller }));
    }
    setParked(loadParked(storage));
    setRecent(loadList(storage, POS_KEYS.recent));
    setFavourites(loadList(storage, POS_KEYS.favourites));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveCart(storageRef.current, cart);
  }, [cart, hydrated]);
  useEffect(() => {
    if (hydrated) saveParked(storageRef.current, parked);
  }, [parked, hydrated]);
  useEffect(() => {
    if (hydrated) saveList(storageRef.current, POS_KEYS.recent, recent);
  }, [recent, hydrated]);
  useEffect(() => {
    if (hydrated) saveList(storageRef.current, POS_KEYS.favourites, favourites);
  }, [favourites, hydrated]);

  /* ── Derived ── */
  const totals = useMemo(() => computeTotals(cart, lookup, rate), [cart, lookup, rate]);
  const customer = customers.find((candidate) => candidate.id === cart.customerId) ?? null;
  const inCartByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart.lines) map.set(line.sellableKey, line.quantity);
    return map;
  }, [cart.lines]);
  const inCartByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of totals.lines) {
      map.set(
        row.sellable.productId,
        (map.get(row.sellable.productId) ?? 0) + row.line.quantity,
      );
    }
    return map;
  }, [totals.lines]);

  const filtered = useMemo(
    () => filterProducts(products, { query: deferredQuery, category }),
    [products, deferredQuery, category],
  );
  const searching = deferredQuery.trim() !== '' || category !== null;

  const favouriteProducts = useMemo(
    () =>
      favourites
        .map((id) => productById.get(id))
        .filter((p): p is PosProduct => p !== undefined),
    [favourites, productById],
  );
  const recentSellables = useMemo(
    () =>
      recent.map((key) => sellableByKey.get(key)).filter((s): s is Sellable => s !== undefined),
    [recent, sellableByKey],
  );

  const lineStockWarnings = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of totals.lines) {
      const available = Math.max(row.sellable.onHand, 0);
      if (row.line.quantity > available) {
        map.set(
          row.line.key,
          available === 0
            ? 'None in stock. The sale will be recorded past the stock count.'
            : `Only ${available} in stock. The sale will go past the stock count.`,
        );
      }
    }
    return map;
  }, [totals.lines]);

  const orderWarnings = useMemo(() => {
    const taken = totals.lines.flatMap((row) =>
      row.sellable.kind === 'bundle'
        ? row.sellable.components.map((component) => ({
            variantId: component.variantId,
            label: component.label,
            quantity: component.quantity * row.line.quantity,
          }))
        : [
            {
              variantId: row.sellable.variantId,
              label: sellableLabel(row.sellable),
              quantity: row.line.quantity,
            },
          ],
    );
    return reservedStockConflicts(taken, positions).map(describeReservedConflict);
  }, [totals.lines, positions]);

  const orderMarginText = useMemo(() => {
    const check = orderMargin({
      totalCents: totals.totalCents,
      currency: cart.currency,
      rateMicros: rate,
      costUsdCents: totals.costUsdCents,
    });
    const text = marginMessage(check.level, 'order');
    return text ? { text, severe: check.level === 'below-cost' } : null;
  }, [totals.totalCents, totals.costUsdCents, cart.currency, rate]);

  const rateStale =
    hasRate && rateEffectiveFrom ? isRateStale(new Date(rateEffectiveFrom)) : false;
  const rateText = hasRate
    ? `1 USD = SRD ${formatRate(rate, 2)}${rateStale && rateEffectiveFrom ? ` · rate from ${formatDateShort(rateEffectiveFrom)}, check it` : ''}`
    : 'No exchange rate is set, so only USD sales can be recorded.';

  const blocker =
    cart.currency === 'SRD' && !hasRate
      ? 'No exchange rate is set. Switch to USD.'
      : cartBlocker(totals);

  const payWallets = useMemo(
    () => walletsFor(wallets, cart.currency),
    [wallets, cart.currency],
  );
  const walletId = payWallets.some((wallet) => wallet.id === walletChoice)
    ? walletChoice
    : (payWallets[0]?.id ?? null);
  const wallet = payWallets.find((candidate) => candidate.id === walletId) ?? null;
  const plan = planSettlement({
    dueCents: totals.totalCents,
    receivedCents: parseReceived(received),
    onAccount,
    isCashWallet: wallet?.kind === 'cash',
    hasCustomer: customer !== null,
    hasWallet: wallet !== null,
  });

  const fingerprint = cartFingerprint(cart, totals);
  const unconfirmedNote =
    unconfirmed && unconfirmed.fingerprint !== fingerprint
      ? `An earlier attempt (${unconfirmed.label}) was never confirmed and may have been recorded. Open Today to check before charging again.`
      : null;

  const now = useNow(15_000, step === 'done');

  /* ── Adding ── */
  function flash(sellableKey: string) {
    setFreshKey(sellableKey);
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFreshKey(null), 1000);
  }

  function addSellable(sellable: Sellable, quantity = 1) {
    if (step !== 'cart') {
      setStep('cart');
      setPayError(null);
    }
    setCart((current) => addToCart(current, sellable, quantity).cart);
    flash(sellable.key);
    announce(`Added ${quantity > 1 ? `${quantity} x ` : ''}${sellableLabel(sellable)}`);
  }

  function pressProduct(product: PosProduct) {
    const only = product.sellables[0];
    if (product.sellables.length === 1 && only) addSellable(only);
    else setVariantFor(product);
  }

  /** The search box / scanner path: a code adds directly, else a unique name match does. */
  function handleEntry(text: string): string {
    const match = resolveEntry(text, codeIndex);
    if (match) {
      addSellable(match.sellable, match.quantity);
      setQuery('');
      return `Added ${sellableLabel(match.sellable)}`;
    }
    const matches = filterProducts(products, { query: text, category: null });
    if (matches.length === 1 && matches[0]) {
      pressProduct(matches[0]);
      setQuery('');
      return `Found ${matches[0].name}`;
    }
    if (matches.length === 0) {
      const message = `Nothing matches "${text}".`;
      announce(message);
      return message;
    }
    const first = document.querySelector<HTMLElement>('[data-pos-tile]');
    first?.focus();
    return `${matches.length} products match. Pick one.`;
  }

  /* ── Cart actions ── */
  function removeFromCart(lineKey: string) {
    const removal = removeLine(cart, lineKey);
    if (!removal.removed) return;
    const removed = removal.removed;
    const label = lookup(removed.sellableKey)?.name ?? 'Item';
    setCart(removal.cart);
    announce(`Removed ${label}`);
    toast(`Removed ${label}`, {
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => setCart((current) => restoreLine(current, removed, removal.index)),
      },
    });
  }

  function clearCart() {
    const before = cart;
    setCart({ ...emptyCart(cart.currency), sellerId: cart.sellerId });
    setOnAccount(false);
    setReceived('');
    setPanelOpen(false);
    toast('Cart cleared', {
      duration: 6000,
      action: { label: 'Undo', onClick: () => setCart(before) },
    });
  }

  function newSale() {
    setLastSale(null);
    setStep('cart');
    setPanelOpen(false);
    setPayError(null);
    setUndoError(null);
    searchRef.current?.focus({ preventScroll: true });
  }

  function chooseSeller(id: string | null) {
    setCart((current) => ({ ...current, sellerId: id }));
    try {
      if (id) window.localStorage.setItem('nextx.lastSeller', id);
    } catch {
      // Blocked storage: the choice is simply not remembered.
    }
  }

  function changeCurrency(next: CurrencyCode) {
    if (next === 'SRD' && !hasRate) return;
    setCart((current) =>
      hasRate
        ? setCurrency(current, next, rate)
        : // No rate to convert typed prices with: back to list prices rather than a wrong number.
          {
            ...setCurrency(current, next, RATE_SCALE),
            discount: current.discount?.mode === 'percent' ? current.discount : null,
            lines: current.lines.map((line) => ({ ...line, overrideCents: null })),
          },
    );
    setWalletChoice(null);
    announce(`Prices now in ${next}`);
  }

  /* ── Parking ── */
  function openPark() {
    setParkLabelHint(customer ? customer.name : `Cart ${timeFormat.format(new Date())}`);
    setParkedOpen(true);
  }

  function parkCurrent(label: string) {
    const result = parkCart(parked, cart, {
      label,
      now: Date.now(),
      units: totals.units,
      totalCents: totals.totalCents,
    });
    if (!result.ok) {
      toast.error(
        result.reason === 'full'
          ? `All ${MAX_PARKED} parked places are used. Resume or delete one first.`
          : 'There is nothing in the cart to park.',
      );
      return;
    }
    setParked(result.parked);
    setCart({ ...emptyCart(cart.currency), sellerId: cart.sellerId });
    setParkedOpen(false);
    setPanelOpen(false);
    setStep('cart');
    toast.success(`Parked "${result.parked[0]?.label ?? label}"`);
  }

  function resume(id: string) {
    const result = resumeParked(parked, id, cart, {
      now: Date.now(),
      units: totals.units,
      totalCents: totals.totalCents,
      label: `Cart ${timeFormat.format(new Date())}`,
    });
    if (!result) return;
    const { cart: next, dropped } = reconcileCart(result.cart, lookup);
    setCart(next);
    setParked(result.parked);
    setParkedOpen(false);
    setStep('cart');
    toast.success('Cart resumed');
    if (dropped > 0)
      toast.info(`${dropped} item${dropped === 1 ? '' : 's'} no longer sold removed.`);
  }

  /* ── Paying ── */
  function goToPay() {
    if (blocker) return;
    setPayError(null);
    setStep('pay');
    setPanelOpen(true);
  }

  async function pay(allowReservedStock = false) {
    if (busy || !online || !canWrite || blocker || plan.kind === 'blocked') return;
    const method = methodForWallet(wallet?.kind ?? 'cash');
    const payload = {
      customerId: cart.customerId,
      sellerId: cart.sellerId,
      soldAt: businessDateInput(),
      currency: cart.currency,
      paymentMethod: method,
      notes: saleNotes(cart, totals),
      discountCents: toDecimalString(totals.discountCents),
      discountReason: cart.discountReason.trim() || undefined,
      walletId: plan.paidNowCents > 0 ? walletId : null,
      confirm: true,
      paidInFull: plan.kind === 'full',
      paidNowCents: plan.kind === 'partial' ? toDecimalString(plan.paidNowCents) : '0',
      allowReservedStock: allowReservedStock && role === 'owner',
      items: totals.lines.map((row) => ({
        variantId: row.sellable.variantId,
        bundleId: row.sellable.bundleId,
        quantity: row.line.quantity,
        unitPriceCents: toDecimalString(row.unitCents),
        serials: [] as string[],
      })),
    };

    // The same schema the server runs, before anything is sent.
    const check = saleSchema.safeParse(payload);
    if (!check.success) {
      setPayError({
        kind: 'other',
        message: describeIssues(check.error.issues)[0] ?? 'Check the cart and try again.',
        hint: null,
      });
      return;
    }

    setBusy(true);
    setPayError(null);
    const key = cart.idempotencyKey;
    const attemptLabel = formatPos(totals.totalCents, cart.currency);
    // Everything the success screen and the receipt need, taken before the cart is cleared.
    const receipt: LastSale['receipt'] = {
      businessName,
      number: '',
      dateLabel: formatDate(`${businessDateInput()}T00:00:00Z`),
      currency: cart.currency,
      lines: totals.lines.map((row) => ({
        name: row.sellable.name,
        option: row.sellable.option,
        quantity: row.line.quantity,
        unitCents: row.unitCents,
        lineCents: row.lineCents,
      })),
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      paidCents: plan.paidNowCents,
      changeCents: plan.kind === 'full' ? plan.changeCents : 0,
      paidWith: plan.paidNowCents > 0 ? (wallet?.name ?? null) : null,
      customerName: customer?.name ?? null,
    };
    const soldKeys = totals.lines.map((row) => row.sellable.key);
    try {
      const result = await createSale({ ...payload, idempotencyKey: key } as never);
      if (result?.data) {
        const data = result.data;
        const sale: LastSale = {
          id: data.id,
          number: data.number,
          currency: cart.currency,
          totalCents: totals.totalCents,
          paidCents: plan.paidNowCents,
          changeCents: plan.kind === 'full' ? plan.changeCents : 0,
          balanceCents: totals.totalCents - plan.paidNowCents,
          shortfall: data.shortfallTotal,
          customerName: customer?.name ?? null,
          walletName: plan.paidNowCents > 0 ? (wallet?.name ?? null) : null,
          whatsappUrl: '',
          invoiceUrl: null,
          repeated: data.reused === true,
          undone: false,
          createdAtMs: Date.now(),
          receipt: { ...receipt, number: data.number },
          customerPhone: customer?.phone ?? null,
        };
        setLastSale(sale);
        setUnconfirmed(null);
        setRecent((current) => soldKeys.reduceRight((list, k) => pushRecent(list, k), current));
        setCart({ ...emptyCart(cart.currency), sellerId: cart.sellerId });
        setReceived('');
        setOnAccount(false);
        setStep('done');
        setUndoError(null);
        announce(
          `Sale ${data.number} recorded. Total ${formatPos(totals.totalCents, cart.currency)}`,
        );
        router.refresh();
      } else {
        // Refused: the transaction rolled back, so the next attempt is a new sale.
        setCart((current) => ({ ...current, idempotencyKey: newUuid() }));
        setPayError(
          describeSaleError(
            result?.serverError ??
              (result?.validationErrors
                ? 'The sale was not accepted. Check the cart and try again.'
                : undefined),
          ),
        );
      }
    } catch {
      // The request may or may not have arrived. Keep the key: pressing Pay again is then safe.
      setUnconfirmed({ fingerprint, label: attemptLabel });
      setPayError({
        kind: 'offline',
        message: 'We could not confirm that the sale was recorded.',
        hint: 'Press Pay again: the same sale is never recorded twice. Or open Today to check.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function undoSale() {
    if (!lastSale || undoBusy) return;
    setUndoBusy(true);
    setUndoError(null);
    try {
      const result = await undoRecentSale({ saleId: lastSale.id });
      if (result?.data) {
        setLastSale({ ...lastSale, undone: true });
        setUndoConfirm(false);
        toast.success(`Sale ${lastSale.number} undone`);
        router.refresh();
      } else {
        setUndoConfirm(false);
        setUndoError(result?.serverError ?? 'Could not undo that sale.');
      }
    } catch {
      setUndoConfirm(false);
      setUndoError('Could not undo that sale. Check your connection.');
    } finally {
      setUndoBusy(false);
    }
  }

  async function openInvoice() {
    if (!lastSale || invoiceBusy) return;
    setInvoiceBusy(true);
    try {
      const result = await createPublicInvoiceLink({ saleId: lastSale.id });
      if (result?.data) {
        const url = result.data.url;
        setLastSale({ ...lastSale, invoiceUrl: url });
        // Not the "noopener" feature string: that makes open() return null even on success, so a
        // blocked pop-up could not be told from an opened one. Cut the tab loose by hand instead.
        const opened = window.open(url, '_blank');
        if (opened) opened.opener = null;
        else toast.info('Invoice link ready. Tap "open" under the buttons.');
      } else {
        toast.error(result?.serverError ?? 'Could not create the invoice link');
      }
    } catch {
      toast.error('Could not create the invoice link. Check your connection.');
    } finally {
      setInvoiceBusy(false);
    }
  }

  /* ── Keyboard (desktop) ── */
  const shortcutRef = useRef<() => void>(() => {});
  useEffect(() => {
    shortcutRef.current = () => {
      if (step === 'cart') goToPay();
      else if (step === 'pay') void pay();
      else if (step === 'done') newSale();
    };
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (view !== 'sell') return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const dialogOpen = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"]',
      );
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !dialogOpen) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !dialogOpen) {
        event.preventDefault();
        shortcutRef.current();
        return;
      }
      if (event.key === 'Escape' && !event.defaultPrevented && !dialogOpen) {
        setPanelOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // Moving into the phone cart sheet moves focus with it; closing it hands focus back to the bar.
  const panelWasOpen = useRef(false);
  useEffect(() => {
    if (isDesktop) return;
    if (panelOpen) panelRef.current?.focus({ preventScroll: true });
    else if (panelWasOpen.current) barButtonRef.current?.focus({ preventScroll: true });
    panelWasOpen.current = panelOpen;
  }, [panelOpen, isDesktop]);

  /* ── Pieces ── */
  const undoMinutes =
    lastSale && !lastSale.undone
      ? undoAllowed({
          createdAtMs: lastSale.createdAtMs,
          nowMs: now,
          memberId,
          memberRole: role,
          createdById: memberId,
        }).ok
        ? undoMinutesLeft(lastSale.createdAtMs, now)
        : 0
      : 0;

  const doneSale: DoneSale | null = lastSale
    ? {
        ...lastSale,
        whatsappUrl: receiptWhatsappUrl(
          buildReceiptText({ ...lastSale.receipt, invoiceUrl: lastSale.invoiceUrl }),
          lastSale.customerPhone,
        ),
      }
    : null;

  const unitsLabel = `${totals.units} item${totals.units === 1 ? '' : 's'}`;
  const hasItems = totals.lines.length > 0;
  const showBar = view === 'sell' && !panelOpen;

  return (
    <div className="flex flex-col pb-24 lg:h-[calc(100dvh-var(--shell-top)-3rem)] lg:pb-0">
      <h1 className="sr-only">Quick sale</h1>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {hasItems
          ? `Cart: ${unitsLabel}, total ${formatPos(totals.totalCents, cart.currency)}`
          : 'Cart is empty'}
      </div>

      {!online ? (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-control border border-warning/40 bg-warning-muted px-3 py-2 text-[13px] text-warning"
        >
          <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          Offline. Your cart is saved on this device. Paying is off until the connection is
          back.
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Counter views"
          className="inline-flex rounded-control border border-line bg-raised p-0.5"
        >
          {(['sell', 'today'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`pos-tab-${tab}`}
              aria-controls={`pos-panel-${tab}`}
              aria-selected={view === tab}
              onClick={() => setView(tab)}
              className={cn(
                'h-11 min-w-24 rounded-[6px] px-4 font-medium text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                view === tab ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:bg-hover',
              )}
            >
              {tab === 'sell' ? 'Quick sale' : 'Today'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={openPark}>
            <PauseCircle aria-hidden="true" />
            Parked
            {parked.length > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] text-accent-fg">
                {parked.length}
              </span>
            ) : null}
          </Button>
        </div>
      </div>

      {view === 'today' ? (
        <div
          role="tabpanel"
          id="pos-panel-today"
          aria-labelledby="pos-tab-today"
          className="mx-auto w-full max-w-3xl"
        >
          <TodayView
            initial={null}
            memberId={memberId}
            role={role}
            businessName={businessName}
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="pos-panel-sell"
          aria-labelledby="pos-tab-sell"
          className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px]"
        >
          {/* ── Products ── */}
          <section
            aria-label="Products"
            className="flex min-h-0 min-w-0 flex-col"
            inert={panelOpen && !isDesktop}
          >
            <div className="sticky top-[var(--shell-top)] z-20 -mx-4 shrink-0 bg-base px-4 pb-2 lg:static lg:mx-0 lg:px-0">
              <form
                className="relative"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (query.trim()) handleEntry(query);
                }}
              >
                <label htmlFor="pos-search" className="sr-only">
                  Search products, or type or scan a SKU
                </label>
                <span id="pos-search-hint" className="sr-only">
                  Type or scan a SKU and press Enter to add it. Press the slash key to jump
                  here.
                </span>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4"
                />
                <input
                  id="pos-search"
                  aria-describedby="pos-search-hint"
                  ref={searchRef}
                  type="search"
                  enterKeyHint="go"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Search or scan a SKU"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setQuery('');
                      event.currentTarget.blur();
                    }
                  }}
                  className={searchClass}
                />
                <div className="absolute top-0 right-0 flex h-11 items-center">
                  {query ? (
                    <button
                      type="button"
                      aria-label="Clear the search"
                      onClick={() => {
                        setQuery('');
                        searchRef.current?.focus();
                      }}
                      className="grid size-11 place-items-center text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  ) : (
                    <kbd className="mr-3 hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink-3 lg:block">
                      /
                    </kbd>
                  )}
                  {canScan ? (
                    <button
                      type="button"
                      aria-label="Scan a barcode with the camera"
                      onClick={() => {
                        setScanNote(null);
                        setScanOpen(true);
                      }}
                      className="grid size-11 place-items-center text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Camera aria-hidden="true" className="size-5" />
                    </button>
                  ) : null}
                </div>
              </form>

              {categories.length > 0 ? (
                <fieldset className="pos-chips -mx-4 m-0 mt-2 flex min-w-0 gap-2 overflow-x-auto border-0 px-4 pb-0.5 lg:mx-0 lg:px-0">
                  <legend className="sr-only">Categories</legend>
                  <Chip active={category === null} onClick={() => setCategory(null)}>
                    All
                  </Chip>
                  {categories.map((chip) => (
                    <Chip
                      key={chip.name}
                      active={category === chip.name}
                      onClick={() => setCategory(category === chip.name ? null : chip.name)}
                    >
                      {chip.name}
                      <span className="ml-1.5 text-ink-4">{chip.count}</span>
                    </Chip>
                  ))}
                </fieldset>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
              {!searching && favouriteProducts.length > 0 ? (
                <Row title="Favourites">
                  {favouriteProducts.map((product) => (
                    <MiniCard
                      key={product.id}
                      name={product.name}
                      option={
                        product.sellables.length > 1
                          ? `${product.sellables.length} options`
                          : (product.sellables[0]?.option ?? null)
                      }
                      image={product.image}
                      priceLabel={priceRange(
                        product.minPriceCents,
                        product.maxPriceCents,
                        cart.currency,
                        rate,
                      )}
                      inCart={inCartByProduct.get(product.id) ?? 0}
                      onPress={() => pressProduct(product)}
                    />
                  ))}
                </Row>
              ) : null}
              {!searching && recentSellables.length > 0 ? (
                <Row title="Recently sold">
                  {recentSellables.map((sellable) => (
                    <MiniCard
                      key={sellable.key}
                      name={sellable.name}
                      option={sellable.option}
                      image={sellable.image}
                      priceLabel={formatPos(
                        listPriceIn(sellable.listPriceCents, cart.currency, rate),
                        cart.currency,
                      )}
                      inCart={inCartByKey.get(sellable.key) ?? 0}
                      onPress={() => addSellable(sellable)}
                    />
                  ))}
                </Row>
              ) : null}

              {products.length === 0 ? (
                <EmptyNote
                  title="No products to sell yet"
                  text="Add products under Products, and they will appear here."
                />
              ) : filtered.length === 0 ? (
                <EmptyNote
                  title={
                    query.trim()
                      ? `Nothing matches "${query.trim()}"`
                      : 'Nothing in this category'
                  }
                  text="Check the spelling, or try a SKU or a brand."
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setQuery('');
                        setCategory(null);
                      }}
                    >
                      Show everything
                    </Button>
                  }
                />
              ) : (
                <ul className="grid grid-cols-2 gap-2 pt-1 pb-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3 min-[1400px]:grid-cols-4 min-[1700px]:grid-cols-5">
                  {filtered.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      currency={cart.currency}
                      rateMicros={rate}
                      inCart={inCartByProduct.get(product.id) ?? 0}
                      favourite={favourites.includes(product.id)}
                      onPress={pressProduct}
                      onToggleFavourite={(target) =>
                        setFavourites((current) => toggleFavourite(current, target.id))
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ── Cart, pay, done ── */}
          {panelOpen ? (
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => setPanelOpen(false)}
              className="pos-backdrop fixed inset-0 z-[34] bg-black/45 lg:hidden"
            />
          ) : null}
          <aside
            ref={panelRef}
            id="pos-cart"
            tabIndex={-1}
            aria-label="Cart and payment"
            data-open={panelOpen}
            className={cn(
              'pos-cart z-[35] flex min-h-0 flex-col overflow-hidden bg-raised outline-none',
              'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[var(--vv-bottom,0px)] max-lg:h-[min(92dvh,var(--vv-h,100dvh))] max-lg:rounded-t-[18px] max-lg:border-line max-lg:border-t max-lg:shadow-overlay',
              'lg:static lg:h-full lg:rounded-card lg:border lg:border-line-subtle lg:shadow-[var(--nx-shadow-raised)]',
            )}
          >
            {panelOpen && !isDesktop ? <ViewportVars /> : null}
            {step === 'cart' ? (
              <CartView
                cart={cart}
                totals={totals}
                rateMicros={rate}
                hasRate={hasRate}
                rateText={rateText}
                rateStale={rateStale}
                customer={customer}
                sellers={sellers}
                freshLineKey={freshKey}
                lineStockWarnings={lineStockWarnings}
                orderWarnings={orderWarnings}
                orderMarginText={orderMarginText}
                blocker={blocker}
                canCharge={blocker === null}
                chargeHint={hasItems && isDesktop ? 'Ctrl+Enter to charge' : null}
                onClose={() => setPanelOpen(false)}
                onQuantity={(lineKey, quantity) =>
                  setCart((c) => setQuantity(c, lineKey, quantity))
                }
                onRemove={removeFromCart}
                onOverride={(lineKey, cents) => setCart((c) => setOverride(c, lineKey, cents))}
                onNote={(lineKey, note) => setCart((c) => setLineNote(c, lineKey, note))}
                onCurrency={changeCurrency}
                onCustomer={() => setCustomerOpen(true)}
                onSeller={chooseSeller}
                onDiscount={(discount: DiscountInput | null, reason) =>
                  setCart((c) => ({ ...c, discount, discountReason: reason }))
                }
                onOrderNote={(note) => setCart((c) => ({ ...c, note }))}
                onPark={openPark}
                onClear={clearCart}
                onCharge={goToPay}
              />
            ) : step === 'pay' ? (
              <PayView
                currency={cart.currency}
                dueCents={totals.totalCents}
                customer={customer}
                wallets={payWallets}
                walletId={walletId}
                received={received}
                onAccount={onAccount}
                plan={plan}
                busy={busy}
                online={online}
                canWrite={canWrite}
                error={payError}
                unconfirmedNote={unconfirmedNote}
                ownerCanOverride={role === 'owner'}
                onWallet={(id) => setWalletChoice(id)}
                onReceived={setReceived}
                onAccountChange={setOnAccount}
                onBack={() => {
                  setStep('cart');
                  setReceived('');
                  setPayError(null);
                }}
                onPay={() => void pay()}
                onPayOverride={() => void pay(true)}
              />
            ) : doneSale ? (
              <DoneView
                sale={doneSale}
                undoMinutes={undoMinutes}
                undoBusy={undoBusy}
                invoiceBusy={invoiceBusy}
                undoError={undoError}
                onUndo={() => setUndoConfirm(true)}
                onInvoice={() => void openInvoice()}
                onNew={newSale}
              />
            ) : null}
          </aside>
        </div>
      )}

      {/* Phones: the running total and the way in to the cart, always in reach of the thumb. */}
      {showBar ? (
        <div
          data-pos-bar=""
          data-hides-tabbar=""
          className="fixed inset-x-0 bottom-0 z-30 border-line border-t bg-raised pt-2 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] shadow-[0_-6px_18px_-10px_rgb(0_0_0/0.25)] lg:hidden"
        >
          <div className="flex items-center gap-3">
            <button
              ref={barButtonRef}
              type="button"
              aria-controls="pos-cart"
              aria-expanded={panelOpen}
              onClick={() => {
                setPanelOpen(true);
              }}
              className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-inset text-ink-2">
                <ShoppingBasket aria-hidden="true" className="size-5" />
                {hasItems ? (
                  <span
                    key={totals.units}
                    aria-hidden="true"
                    className="pos-pop absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-bold text-[11px] text-accent-fg"
                  >
                    {totals.units}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="tabular block font-bold text-[18px] text-ink leading-6">
                  {hasItems
                    ? formatPos(totals.totalCents, cart.currency)
                    : step === 'done' && lastSale
                      ? `Sale ${lastSale.number}`
                      : 'Cart is empty'}
                </span>
                <span className="block text-[12px] text-ink-3">
                  {hasItems
                    ? `${unitsLabel} · tap to review`
                    : step === 'done'
                      ? 'Tap for the receipt'
                      : 'Tap a product to add it'}
                </span>
              </span>
            </button>
            <Button
              type="button"
              variant="primary"
              disabled={blocker !== null}
              onClick={goToPay}
              className="h-12 px-6 text-[16px] max-sm:h-12"
            >
              Charge
            </Button>
          </div>
        </div>
      ) : null}

      <VariantSheet
        product={variantFor}
        currency={cart.currency}
        rateMicros={rate}
        inCartByKey={inCartByKey}
        onChoose={(sellable) => {
          addSellable(sellable);
          setVariantFor(null);
        }}
        onClose={() => setVariantFor(null)}
      />
      <CustomerSheet
        open={customerOpen}
        onOpenChange={setCustomerOpen}
        customers={customers}
        selectedId={cart.customerId}
        onSelect={(id) => {
          setCart((current) => ({ ...current, customerId: id }));
          if (id === null) setOnAccount(false);
        }}
        onCreated={(created) => setCustomers((current) => [...current, created])}
      />
      <ParkedSheet
        open={parkedOpen}
        onOpenChange={setParkedOpen}
        parked={parked}
        cartHasItems={hasItems}
        suggestedLabel={parkLabelHint}
        onPark={parkCurrent}
        onResume={resume}
        onDelete={(id) => setParked((current) => removeParked(current, id))}
      />
      <ScannerSheet
        open={scanOpen}
        onOpenChange={setScanOpen}
        lastResult={scanNote}
        onCode={(code) => {
          const match = resolveEntry(code, codeIndex);
          if (!match) {
            const message = `No product has the code ${code}.`;
            setScanNote(message);
            return message;
          }
          addSellable(match.sellable, match.quantity);
          const message = `Added ${sellableLabel(match.sellable)}`;
          setScanNote(message);
          return message;
        }}
      />
      <ConfirmDialog
        open={undoConfirm}
        onOpenChange={(open) => {
          if (!undoBusy) setUndoConfirm(open);
        }}
        title={`Undo sale ${lastSale?.number ?? ''}?`}
        description="The goods go back into stock and the payment is reversed. The sale stays on record as voided."
        confirmLabel="Undo sale"
        pending={undoBusy}
        onConfirm={() => void undoSale()}
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[14px] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-line bg-raised text-ink-2 hover:border-line-strong',
      )}
    >
      {children}
    </button>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2" aria-label={title}>
      <h2 className="mb-1.5 text-[12px] text-ink-3 uppercase tracking-[0.08em]">{title}</h2>
      <ul className="pos-chips -mx-4 flex gap-2 overflow-x-auto px-4 py-1 lg:mx-0 lg:px-0">
        {children}
      </ul>
    </section>
  );
}

function EmptyNote({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center px-4 py-10 text-center">
      <div>
        <p className="font-medium text-[15px] text-ink">{title}</p>
        <p className="mt-1 text-[13px] text-ink-3">{text}</p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
