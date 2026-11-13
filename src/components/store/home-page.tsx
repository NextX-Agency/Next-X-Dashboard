import { ArrowRight, ArrowUpRight, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type CSSProperties, Suspense } from 'react';
import { ProductCard } from '@/components/store/product-card';
import { SafeImage } from '@/components/store/safe-image';
import { StorePrice } from '@/components/store/store-price';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { publicText } from '@/lib/english-content';
import type { RateMicros } from '@/lib/fx';
import {
  accessoryShelf,
  type CategoryTile,
  categoryTiles,
  DEFAULT_HERO_BODY,
  DEFAULT_HERO_TITLE,
  latestAdditions,
  ownerHeroCopy,
  pickShowcase,
} from '@/lib/home-merchandising';
import { assortmentMessage } from '@/lib/store-messages';
import { plural } from '@/lib/store-money';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import {
  type CatalogListItem,
  listCatalogBundles,
  listCatalogCategories,
  listCatalogProducts,
  listStorePickupLocations,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

type Settings = NonNullable<Awaited<ReturnType<typeof getSettings>>>;
type Currency = 'USD' | 'SRD';

const SECTION = 'mx-auto w-full max-w-[1320px] px-4 lg:px-8';
/** Tighter on a phone: 40 px between sections, 64 from `sm`, 96 from `lg`. */
const SECTION_GAP = 'mt-10 sm:mt-16 lg:mt-24';
const SECTION_TITLE = 'nx-display text-[clamp(24px,3.4vw,38px)]';
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** 1 -> "01": the numbering the agency site uses for every list of things. */
const num = (index: number) => String(index + 1).padStart(2, '0');

/** Delay step for the quiet entrance (`.nx-enter`); the headline and the first photograph never wait. */
const stagger = (index: number): CSSProperties => ({ '--i': index }) as CSSProperties;

/**
 * The home page of a shop: an opening composition of real products, the categories as places to go, two
 * shelves that never repeat each other (latest additions, accessories), and the plain facts a first-time
 * customer needs before they trust a shop: how to order, where to collect, how to pay, how to reach us.
 * Every product, price and line of text comes from the catalogue or from the owner's settings; a line
 * the owner has not filled in is not shown.
 */
export function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const [products, categories, settings, storefront, rate, pickupLocations] = await Promise.all(
    [
      listCatalogProducts({ sort: 'newest' }),
      listCatalogCategories(),
      getSettings(),
      getRequestStorefront(),
      getCurrentRate(),
      listStorePickupLocations(),
    ],
  );
  const srdRate = rate?.rateMicros;
  const businessName = settings?.businessName ?? 'NextX';
  const currency: Currency = storefront?.defaultCurrency ?? 'SRD';

  // Each shelf takes what the one before did not, so the page reads as different shelves.
  const showcase = pickShowcase(products);
  const used = new Set(showcase.map((product) => product.id));
  const latest = latestAdditions(products, used, 4);
  for (const product of latest) used.add(product.id);
  const accessories = accessoryShelf(products, used, 4);
  const tiles = categoryTiles(categories, products);
  const inStockCount = products.filter((product) => product.onHand > 0).length;
  const help = whatsappLink(settings?.whatsapp, assortmentMessage(businessName));

  return (
    <div className="pb-6 sm:pb-16 lg:pb-24">
      <Hero
        settings={settings}
        showcase={showcase}
        srdRate={srdRate}
        businessName={businessName}
        currency={currency}
        inStockCount={inStockCount}
        whatsappHref={help}
      />

      <Ticker words={tickerWords(categories, products)} />

      {tiles.length ? (
        <CategoryTiles tiles={tiles} currency={currency} srdRate={srdRate} />
      ) : null}

      {latest.length ? (
        <Shelf
          id="latest"
          title="New in"
          products={latest}
          srdRate={srdRate}
          action={{ href: SHOP_PATH, label: `All ${plural(products.length, 'product')}` }}
        />
      ) : null}

      {accessories ? (
        <Shelf
          id="accessories"
          title={accessories.category.name}
          products={accessories.items}
          srdRate={srdRate}
          action={{
            href: `${SHOP_PATH}?category=${accessories.category.slug}`,
            label: 'See all',
          }}
        />
      ) : null}

      <Suspense fallback={null}>
        <Sets
          enabled={Boolean(settings?.homepageFeaturedBundlesEnabled)}
          limit={settings?.homepageFeaturedBundlesLimit}
          srdRate={srdRate}
        />
      </Suspense>

      {help ? <Ordering settings={settings} businessName={businessName} /> : null}

      <Pickup
        settings={settings}
        pickupLocations={pickupLocations}
        businessName={businessName}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function Hero({
  settings,
  showcase,
  srdRate,
  businessName,
  currency,
  inStockCount,
  whatsappHref,
}: {
  settings: Settings | null;
  showcase: CatalogListItem[];
  srdRate: RateMicros | undefined;
  businessName: string;
  currency: Currency;
  inStockCount: number;
  whatsappHref: string | null;
}) {
  // The owner's words win; a placeholder ("Welcome To NextX") counts as no words at all.
  const title = ownerHeroCopy(publicText(settings?.heroTitle)) ?? DEFAULT_HERO_TITLE;
  const body = ownerHeroCopy(publicText(settings?.heroBody)) ?? DEFAULT_HERO_BODY;
  const eyebrow = [businessName, settings?.city].filter(Boolean).join(' · ');
  // One plain line of facts that exist: the stock count, the currency, how it reaches the customer.
  const facts = [
    inStockCount > 0 ? `${plural(inStockCount, 'product')} in stock` : null,
    `Prices in ${currency}`,
    settings?.pickupEnabled
      ? publicText(settings.pickupLabel?.trim()) ||
        (settings.city ? `Pickup in ${settings.city}` : 'Pickup')
      : null,
    settings?.deliveryEnabled ? 'Delivery available' : null,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <section aria-labelledby="home-title" className={cn(SECTION, 'pt-3 sm:pt-6 lg:pt-10')}>
      <div className="grid gap-4 sm:gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-stretch lg:gap-12">
        <div className="flex min-w-0 flex-col justify-center lg:py-8">
          <p className="nx-label nx-enter text-accent">{eyebrow}</p>
          <h1
            id="home-title"
            className="nx-display mt-2 text-balance text-[clamp(34px,5.6vw,76px)] leading-[0.96] text-ink sm:mt-5"
          >
            {title}
          </h1>
          <p
            className="nx-enter mt-3 max-w-[44ch] text-[15px] text-ink-2 leading-[1.5] sm:mt-5 sm:text-[17px] sm:leading-relaxed"
            style={stagger(1)}
          >
            {body}
          </p>
          <div className="nx-enter mt-4 flex flex-wrap gap-3 sm:mt-7" style={stagger(2)}>
            <Link
              href={SHOP_PATH as never}
              className="nx-btn nx-btn-primary flex-1 px-5 sm:flex-none sm:px-7"
            >
              Shop all products <ArrowRight />
            </Link>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-line px-4 sm:px-6"
              >
                <MessageCircle /> <span className="sm:hidden">WhatsApp</span>
                <span className="max-sm:hidden">Ask on WhatsApp</span>
              </a>
            ) : null}
          </div>
          <ul
            className="nx-enter mt-5 flex flex-wrap border-ink border-t-2 pt-3 font-semibold text-[13px] text-ink sm:mt-8 sm:pt-4 sm:text-[14px]"
            style={stagger(3)}
          >
            {facts.map((fact, index) => (
              <li key={fact} className="flex items-center">
                {index > 0 ? (
                  <span aria-hidden="true" className="px-2.5 text-accent sm:px-3">
                    /
                  </span>
                ) : null}
                {fact}
              </li>
            ))}
          </ul>
        </div>
        {showcase.length ? <Showcase products={showcase} srdRate={srdRate} /> : null}
      </div>
    </section>
  );
}

/**
 * Up to three real products, large, on the brand colour. Each sits in its own white frame so its true
 * colours show (the photographs are shot on white, so they are never tinted), links to its page and
 * carries its number, name and price. Two products make a two-frame composition. The frames have fixed
 * proportions, so nothing moves when the photographs arrive.
 */
function Showcase({
  products,
  srdRate,
}: {
  products: CatalogListItem[];
  srdRate: RateMicros | undefined;
}) {
  const [main, second, third] = products;
  if (!main || !second) return null;
  const frames = [
    { product: main, className: 'col-span-2 md:col-span-7 md:row-span-6', large: true },
    {
      product: second,
      className: third ? 'md:col-span-5 md:row-span-3' : 'md:col-span-5 md:row-span-6',
      large: false,
    },
    ...(third
      ? [{ product: third, className: 'md:col-span-5 md:row-span-3', large: false }]
      : []),
  ];
  return (
    <ul
      aria-label="Products"
      className="grid grid-cols-2 gap-3 nx-showcase rounded-[28px] bg-store-bright p-3 md:min-h-[480px] md:grid-cols-12 md:grid-rows-6 md:p-5 lg:min-h-[540px]"
    >
      {frames.map(({ product, className, large }, index) => (
        <li
          key={product.id}
          className={cn('min-w-0', index > 0 && 'nx-enter', className)}
          style={index > 0 ? stagger(index) : undefined}
        >
          <Link
            href={storefrontProductPath(null, product.slug) as never}
            className="group nx-zoom-host flex h-full flex-col overflow-hidden rounded-[18px] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span
              className={cn(
                'relative block min-h-0 flex-1',
                large ? 'aspect-[3/2] md:aspect-auto' : 'aspect-square md:aspect-auto',
              )}
            >
              {product.image ? (
                <Image
                  src={product.image.url}
                  alt=""
                  fill
                  // The first frame is the page's largest image: fetch it first, skip the lazy wait.
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  sizes={
                    large
                      ? '(max-width: 767px) 90vw, (max-width: 1023px) 56vw, 30vw'
                      : '(max-width: 767px) 45vw, (max-width: 1023px) 40vw, 22vw'
                  }
                  className="nx-img object-contain p-[6%]"
                />
              ) : null}
            </span>
            <span className="flex items-end justify-between gap-3 border-line border-t px-3.5 py-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[14px] text-ink">
                  {product.name}
                </span>
                <span className="mt-1.5 block">
                  <StorePrice
                    amountCents={product.minPriceCents}
                    currency={product.priceCurrency}
                    srdRate={srdRate}
                    size="sm"
                  />
                </span>
              </span>
              <span
                aria-hidden="true"
                className="tabular shrink-0 font-bold text-[13px] text-accent"
              >
                {num(index)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * The categories as places to go, numbered. Their number decides the layout: with three, one large tile
 * and two smaller ones. Each shows a real photograph of something in it and the real lowest price.
 */
function CategoryTiles({
  tiles,
  currency,
  srdRate,
}: {
  tiles: CategoryTile[];
  currency: Currency;
  srdRate: RateMicros | undefined;
}) {
  const three = tiles.length === 3;
  return (
    <section aria-labelledby="home-categories" className={cn(SECTION, SECTION_GAP)}>
      <h2 id="home-categories" className={cn(SECTION_TITLE, 'nx-reveal')}>
        Categories
      </h2>
      <ul
        className={cn(
          // A phone swipes through the categories in one short row instead of stacking them
          // (the next tile peeks in, so it reads as a row); from `sm` they are a grid again.
          'nx-stagger nx-snap-row mt-4 flex gap-3 sm:mt-6 sm:grid sm:gap-4',
          three
            ? 'md:grid-cols-6 md:grid-rows-2'
            : tiles.length === 2
              ? 'md:grid-cols-2'
              : 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {tiles.map((tile, index) => (
          <li
            key={tile.slug}
            className={cn(
              'nx-reveal w-[72%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink',
              three && index === 0 && 'md:col-span-4 md:row-span-2',
              three && index > 0 && 'md:col-span-2',
            )}
          >
            <CategoryTileCard
              tile={tile}
              number={num(index)}
              currency={currency}
              srdRate={srdRate}
              large={three && index === 0}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTileCard({
  tile,
  number,
  currency,
  srdRate,
  large,
}: {
  tile: CategoryTile;
  number: string;
  currency: Currency;
  srdRate: RateMicros | undefined;
  large: boolean;
}) {
  // One photograph per tile: a second one stacked on the first, multiplied onto it, reads as a ghost.
  const [first] = tile.images;
  return (
    <Link
      href={`${SHOP_PATH}?category=${tile.slug}` as never}
      className={cn(
        'group nx-zoom-host relative flex h-full overflow-hidden rounded-[20px] p-4 transition-colors sm:rounded-[24px] sm:p-7',
        large ? 'bg-store-bright-soft hover:bg-[#ffe6d2]' : 'bg-sunken hover:bg-hover',
        large ? 'min-h-[200px] sm:min-h-[260px] md:min-h-[420px]' : 'min-h-[200px]',
        FOCUS,
      )}
    >
      <div className="relative z-10 flex max-w-[55%] flex-col">
        <span aria-hidden="true" className="tabular font-bold text-[14px] text-accent">
          {number}
        </span>
        <h3
          className={cn(
            'nx-display mt-3 text-ink underline-offset-4 group-hover:underline',
            large ? 'text-[clamp(26px,3vw,40px)]' : 'text-[clamp(20px,2vw,26px)]',
          )}
        >
          {tile.name}
        </h3>
        <p className="mt-2 text-[14px] text-ink-2">{plural(tile.count, 'product')}</p>
        {tile.fromCents !== null ? (
          <StorePrice
            amountCents={tile.fromCents}
            currency={currency}
            srdRate={srdRate}
            size="sm"
            prefix="from"
            className="mt-auto pt-6"
          />
        ) : null}
      </div>
      <ArrowUpRight
        aria-hidden="true"
        className="nx-arrow absolute top-4 right-4 z-10 size-6 text-ink group-hover:text-accent sm:top-7 sm:right-7 sm:size-7"
      />
      {first ? (
        <SafeImage
          fallback={null}
          src={first.image.url}
          alt=""
          width={first.image.width}
          height={first.image.height}
          sizes={large ? '(max-width: 767px) 60vw, 34vw' : '(max-width: 767px) 50vw, 22vw'}
          className={cn(
            'absolute mix-blend-multiply',
            large
              ? 'right-[-2%] bottom-[-4%] w-[52%] max-w-[460px] sm:w-[62%]'
              : 'right-[-6%] bottom-[-8%] w-[52%] max-w-[240px]',
          )}
        />
      ) : null}
    </Link>
  );
}

/* ------------------------------------------------------------------------------------------------ */

function Shelf({
  id,
  title,
  products,
  srdRate,
  action,
}: {
  id: string;
  title: string;
  products: CatalogListItem[];
  srdRate: RateMicros | undefined;
  action: { href: string; label: string };
}) {
  return (
    <section aria-labelledby={`home-${id}`} className={cn(SECTION, SECTION_GAP, 'nx-cv')}>
      <div className="nx-reveal flex items-end justify-between gap-4">
        <h2 id={`home-${id}`} className={SECTION_TITLE}>
          {title}
        </h2>
        <Link
          href={action.href as never}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold text-[14px] text-ink underline-offset-4 hover:underline',
            FOCUS,
          )}
        >
          {action.label} <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <ul className="nx-stagger mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="nx-reveal">
            <ProductCard product={product} srdRate={srdRate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bundles as a numbered list of rows: name, what is in it, price. Only when the owner switched it on. */
async function Sets({
  enabled,
  limit,
  srdRate,
}: {
  enabled: boolean;
  limit: number | undefined;
  srdRate: RateMicros | undefined;
}) {
  if (!enabled) return null;
  const bundles = await listCatalogBundles(limit);
  if (!bundles.length) return null;
  return (
    <section
      id="sets"
      aria-labelledby="home-bundles"
      className={cn(SECTION, SECTION_GAP, 'nx-cv scroll-mt-0 sm:scroll-mt-24')}
    >
      <h2 id="home-bundles" className={cn(SECTION_TITLE, 'nx-reveal')}>
        Bundles
      </h2>
      <ul className="nx-reveal mt-4 border-line border-b sm:mt-6">
        {bundles.map((bundle, index) => (
          <li key={bundle.id} className="border-line border-t">
            <Link
              href={`/setups/${bundle.slug}` as never}
              className={cn('group flex items-start gap-4 py-4 sm:gap-8 sm:py-5', FOCUS)}
            >
              <span
                aria-hidden="true"
                className="tabular w-7 shrink-0 pt-0.5 font-bold text-[14px] text-accent"
              >
                {num(index)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[17px] underline-offset-4 group-hover:underline">
                  {bundle.name}
                </span>
                {bundle.summary ? (
                  <span className="mt-1 block max-w-[60ch] text-[14px] text-ink-3">
                    {bundle.summary}
                  </span>
                ) : null}
              </span>
              <StorePrice usdCents={bundle.priceCents} srdRate={srdRate} size="md" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * The words of the catalogue itself, large and moving: every category and every brand the shop really
 * carries, nothing else. Fewer than three words is not a band.
 */
function tickerWords(categories: { name: string }[], products: CatalogListItem[]): string[] {
  const brands = [
    ...new Set(
      products
        .map((product) => product.brandName?.trim())
        .filter((b): b is string => Boolean(b)),
    ),
  ];
  const names = categories.map((category) => category.name);
  const words: string[] = [];
  for (let i = 0; i < Math.max(names.length, brands.length); i++) {
    const name = names[i];
    const brand = brands[i];
    if (name) words.push(name);
    if (brand) words.push(brand);
  }
  return words.slice(0, 12);
}

/**
 * A slow band of type between the hero and the categories. The first copy is the real list; the second
 * is hidden from assistive technology and only exists so the loop has no seam. Without motion (reduced
 * motion, no CSS animation) it is a still row that clips at the edge.
 */
function Ticker({ words }: { words: string[] }) {
  if (words.length < 3) return null;
  const row = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : 'What the shop carries'}
      className="flex shrink-0 items-center"
    >
      {words.map((word, index) => (
        <li key={word} className="flex items-center whitespace-nowrap">
          <span
            className={cn(
              'nx-display px-5 text-[clamp(20px,2.6vw,34px)] sm:px-8',
              index % 2 ? 'text-night-ink-2' : 'text-night-ink',
            )}
          >
            {word}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-store-bright sm:size-5"
          >
            <path
              d="M3 3l18 18M21 3L3 21"
              stroke="currentColor"
              strokeWidth="3.5"
              fill="none"
            />
          </svg>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-8 overflow-hidden bg-night py-4 sm:mt-14 sm:py-6 lg:mt-20">
      <div className="nx-marquee flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * How an order works here, in three steps. Only what the cart really does: it writes the WhatsApp
 * message, and nothing is final until the shop has confirmed price and stock.
 */
function Ordering({
  settings,
  businessName,
}: {
  settings: Settings | null;
  businessName: string;
}) {
  const pickup = Boolean(settings?.pickupEnabled);
  const delivery = Boolean(settings?.deliveryEnabled);
  const handover =
    pickup && delivery
      ? 'Collect it or have it delivered'
      : delivery
        ? 'Have it delivered'
        : 'Collect your order';
  const steps = [
    {
      title: 'Fill your cart',
      body: 'Add what you want. Every price is shown in full before you send anything.',
    },
    {
      title: 'Send it on WhatsApp',
      body: `The cart writes the message for you. ${businessName} confirms price and stock before anything is final.`,
    },
    {
      title: handover,
      body: pickup
        ? 'You agree the pickup place and time in the same chat.'
        : 'You agree the details in the same chat.',
    },
  ];
  return (
    <section aria-labelledby="home-ordering" className={cn(SECTION, SECTION_GAP, 'nx-cv')}>
      <h2 id="home-ordering" className={cn(SECTION_TITLE, 'nx-reveal')}>
        How ordering works
      </h2>
      {/* The same numbered, ruled columns as the footer: a list, not a row of cards. */}
      <ol className="nx-stagger mt-5 grid gap-x-8 gap-y-6 sm:mt-8 md:grid-cols-3 lg:gap-x-12">
        {steps.map(({ title, body }, index) => (
          <li key={title} className="nx-reveal border-ink border-t-2 pt-4">
            <span aria-hidden="true" className="tabular font-bold text-[14px] text-accent">
              {num(index)}
            </span>
            <h3 className="nx-display mt-3 text-[clamp(20px,2vw,26px)] text-ink">{title}</h3>
            <p className="mt-2 max-w-[38ch] text-[15px] text-ink-2 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * Pickup places, hours, payment, delivery and phone: one dark band, each fact only when the owner has
 * entered it, and no band at all when none are. Full width, so it never has to match another card's height.
 */
function Pickup({
  settings,
  pickupLocations,
  businessName,
}: {
  settings: Settings | null;
  pickupLocations: { id: string; name: string }[];
  businessName: string;
}) {
  const delivery = Boolean(settings?.deliveryEnabled);
  const payments = settings?.paymentMethods ?? [];
  const address = [settings?.addressLine, settings?.city].filter(Boolean).join(', ');
  const deliveryLine = [
    settings?.deliveryDetails,
    settings?.deliveryAreas,
    settings?.deliveryFeeDisplay,
    settings?.deliveryEstimateDisplay,
  ]
    .filter((line): line is string => Boolean(line))
    .map((line) => publicText(line))
    .join(' · ');
  const hasPickupPlace = Boolean(pickupLocations.length || settings?.addressLine);
  const hasFacts =
    hasPickupPlace || settings?.openingHours || payments.length || delivery || settings?.phone;
  if (!hasFacts) return null;

  return (
    <section
      id="pickup"
      aria-labelledby="home-pickup"
      className={cn(SECTION, 'nx-cv mt-8 scroll-mt-0 sm:mt-10 sm:scroll-mt-24 lg:mt-12')}
    >
      <div className="nx-reveal relative overflow-hidden rounded-[20px] bg-night p-5 text-night-ink sm:rounded-[24px] sm:p-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
        <h2 id="home-pickup" className="nx-display text-[clamp(24px,3.4vw,38px)]">
          Pickup and contact
        </h2>
        <dl className="mt-5 grid gap-x-10 gap-y-4 text-[15px] sm:mt-8 sm:grid-cols-2 sm:gap-y-6 lg:mt-1">
          {hasPickupPlace ? (
            <Fact label="Pickup">
              {pickupLocations.length ? (
                <ul>
                  {pickupLocations.map((location) => (
                    <li key={location.id}>{publicText(location.name)}</li>
                  ))}
                </ul>
              ) : (
                address
              )}
              {settings?.pickupDetails ? (
                <p className="mt-1 text-night-ink-2">{publicText(settings.pickupDetails)}</p>
              ) : null}
            </Fact>
          ) : null}
          {settings?.openingHours ? (
            <Fact label="Opening hours">{publicText(settings.openingHours)}</Fact>
          ) : null}
          {payments.length ? (
            <Fact label="Payment">
              <ul>
                {payments.map((method) => (
                  <li key={method.name}>
                    {publicText(method.name)}
                    {method.details ? (
                      <span className="text-night-ink-2"> · {publicText(method.details)}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Fact>
          ) : null}
          {delivery ? (
            <Fact label="Delivery">
              {deliveryLine || `Available. Ask ${businessName} for the details.`}
            </Fact>
          ) : null}
          {settings?.phone ? (
            <Fact label="Call">
              <a
                href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}
                className="underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white"
              >
                {settings.phone}
              </a>
            </Fact>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-night-line border-t pt-3">
      <dt className="font-semibold text-[12px] text-night-ink-2 uppercase tracking-[0.08em]">
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1320px] px-4 min-h-[100svh] pt-6 lg:px-8"
      aria-hidden="true"
    >
      <div className="grid gap-8 lg:grid-cols-[5fr_6fr]">
        <div className="space-y-4 py-8">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
        <Skeleton className="aspect-[6/5] rounded-[28px]" />
      </div>
    </div>
  );
}
