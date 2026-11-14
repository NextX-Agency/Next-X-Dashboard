import Link from 'next/link';
import { type CSSProperties, Fragment, Suspense } from 'react';
import { Arrow, ArrowOut } from '@/components/store/arrow';
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
/** Generous, like the agency site: 56 px between sections on a phone, 80 from `sm`, 128 from `lg`. */
const SECTION_GAP = 'mt-14 sm:mt-20 lg:mt-32';
const SECTION_TITLE = 'nx-display text-[clamp(30px,4.2vw,60px)]';
const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
    <div className="pb-10 sm:pb-20 lg:pb-28">
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

/** A headline's closing full stop (or question mark) in the logo orange, as on the agency site. */
function Headline({ text }: { text: string }) {
  const match = /^(.*?)([.?!])$/s.exec(text.trim());
  if (!match) return <>{text}</>;
  return (
    <>
      {match[1]}
      <span className="text-store-bright">{match[2]}</span>
    </>
  );
}

/**
 * The headline broken where its commas are ("In-ears, / accessories, / earbuds."), so each line can rise
 * into place on its own, as on the agency site. A headline without two or three short parts stays whole.
 */
function headlineLines(text: string): string[] {
  const parts = text
    .trim()
    .split(/(?<=,)\s+/)
    .filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 && parts.every((part) => part.length <= 18)
    ? parts
    : [text.trim()];
}

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
  const lines = headlineLines(title);
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
    <section
      aria-labelledby="home-title"
      className={cn(SECTION, 'pt-4 pb-10 sm:pt-8 sm:pb-14 lg:pt-10 lg:pb-20')}
    >
      <div className="grid gap-7 sm:gap-10 lg:grid-cols-2 lg:items-stretch lg:gap-12">
        <div className="flex min-w-0 flex-col justify-center lg:py-8">
          <p className="nx-enter font-semibold text-[14px] text-accent sm:text-[15px]">
            {eyebrow}
          </p>
          <h1 id="home-title" className="nx-hero-title mt-3 text-ink sm:mt-5">
            {lines.map((line, index) => (
              <span key={line} className="nx-line">
                <span style={stagger(index)}>
                  {index === lines.length - 1 ? <Headline text={line} /> : line}
                  {index < lines.length - 1 ? ' ' : null}
                </span>
              </span>
            ))}
          </h1>
          <p
            className="nx-enter mt-5 max-w-[30rem] text-[16px] text-ink-2 leading-[1.5] sm:mt-7 sm:text-[19px]"
            style={stagger(4)}
          >
            {body}
          </p>
          <div
            className="nx-enter mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 sm:mt-8"
            style={stagger(5)}
          >
            <Link
              href={SHOP_PATH as never}
              className="nx-btn nx-btn-primary group h-14 px-7 text-[16px]"
            >
              Shop all products <Arrow />
            </Link>
            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group inline-flex min-h-11 items-center gap-2.5 font-semibold text-[16px] text-ink',
                  FOCUS,
                )}
              >
                <span className="nx-link-line py-1">Ask on WhatsApp</span> <ArrowOut />
              </a>
            ) : null}
          </div>
          <ul
            className="nx-enter mt-7 flex flex-wrap gap-2 text-[13px] text-ink sm:mt-10 sm:text-[14px]"
            style={stagger(6)}
          >
            {facts.map((fact) => (
              <li key={fact} className="rounded-full bg-sunken px-3.5 py-1.5 font-medium">
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
 * Up to three real products, large, on the logo orange. Each sits in its own white frame so its true
 * colours show (the photographs are shot on white, so they are never tinted), links to its page and
 * carries its name and price. Two products make a two-frame composition. The frames have fixed
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
      className="grid grid-cols-2 gap-3 rounded-[28px] bg-store-bright p-3 md:min-h-[480px] md:grid-cols-12 md:grid-rows-6 md:p-5 lg:min-h-[540px]"
    >
      {frames.map(({ product, className, large }, index) => (
        <li
          key={product.id}
          className={cn('min-w-0', index > 0 && 'nx-enter', className)}
          style={index > 0 ? stagger(index) : undefined}
        >
          <Link
            href={storefrontProductPath(null, product.slug) as never}
            className="group nx-zoom-host flex h-full flex-col overflow-hidden rounded-[18px] bg-white text-[#0e0d0c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e0d0c]"
          >
            <span
              className={cn(
                'relative block min-h-0 flex-1',
                large ? 'aspect-[3/2] md:aspect-auto' : 'aspect-square md:aspect-auto',
              )}
            >
              {product.image ? (
                <SafeImage
                  fallback={null}
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
                  className="nx-img object-cover"
                />
              ) : null}
            </span>
            <span className="flex items-end justify-between gap-3 px-4 pt-3 pb-3.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[14px] tracking-[-0.01em] sm:text-[15px]">
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
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0e0d0c] text-white max-sm:hidden"
              >
                <Arrow />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/** Tile colours in turn: the logo orange, ink, and the warm tan of the agency's third tile. */
const TILE_TONES = [
  { bg: '#ed5f0f', fg: '#0e0d0c' },
  { bg: '#0e0d0c', fg: '#f2f0eb' },
  { bg: '#dcd7cc', fg: '#0e0d0c' },
] as const;

/**
 * The categories as places to go: one colour block each, a real photograph of something in it on a
 * tilted white card (so the photograph is never tinted), the name as one heavy word and the real
 * lowest price.
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
  return (
    <section aria-labelledby="home-categories" className={cn(SECTION, SECTION_GAP)}>
      <h2 id="home-categories" className={cn(SECTION_TITLE, 'nx-reveal')}>
        Categories
      </h2>
      <ul
        className={cn(
          // A phone swipes through the categories in one short row instead of stacking them
          // (the next tile peeks in, so it reads as a row); from `sm` they are a grid again.
          'nx-stagger nx-snap-row mt-5 flex gap-3 sm:mt-8 sm:grid',
          tiles.length === 2
            ? 'sm:grid-cols-2'
            : tiles.length === 3
              ? 'sm:grid-cols-2 lg:grid-cols-3'
              : 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {tiles.map((tile, index) => (
          <li
            key={tile.slug}
            className="nx-reveal w-[78%] max-w-[340px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:shrink"
          >
            <CategoryTileCard
              tile={tile}
              tone={TILE_TONES[index % TILE_TONES.length] ?? TILE_TONES[0]}
              currency={currency}
              srdRate={srdRate}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTileCard({
  tile,
  tone,
  currency,
  srdRate,
}: {
  tile: CategoryTile;
  tone: { bg: string; fg: string };
  currency: Currency;
  srdRate: RateMicros | undefined;
}) {
  // One photograph per tile: a second one stacked on the first reads as a ghost.
  const [first] = tile.images;
  return (
    <Link
      href={`${SHOP_PATH}?category=${tile.slug}` as never}
      className={cn('nx-tile group', FOCUS)}
      style={{ '--tile-bg': tone.bg, '--tile-fg': tone.fg } as CSSProperties}
    >
      <span className="nx-tile-visual" aria-hidden="true">
        {first ? (
          <span className="nx-tile-shot">
            <SafeImage
              fallback={null}
              src={first.image.url}
              alt=""
              fill
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 30vw, 20vw"
              className="object-cover"
            />
          </span>
        ) : null}
      </span>
      <div className="relative z-10 flex items-end justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <h3 className="nx-tile-word text-balance">{tile.name}</h3>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[14px]">
            {plural(tile.count, 'product')}
            {tile.fromCents !== null ? (
              <span className="inline-flex items-baseline gap-1.5 [&_span]:text-[inherit]">
                <span aria-hidden="true">·</span>
                <StorePrice
                  amountCents={tile.fromCents}
                  currency={currency}
                  srdRate={srdRate}
                  size="sm"
                  prefix="from"
                />
              </span>
            ) : null}
          </p>
        </div>
        <span className="nx-tile-go" aria-hidden="true">
          <Arrow />
        </span>
      </div>
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
            'group inline-flex min-h-11 shrink-0 items-center gap-2.5 font-semibold text-[15px] text-ink',
            FOCUS,
          )}
        >
          <span className="nx-link-line py-1">{action.label}</span> <Arrow />
        </Link>
      </div>
      <ul className="nx-stagger mt-5 grid grid-cols-2 gap-x-3 gap-y-8 sm:mt-8 sm:gap-x-4 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="nx-reveal">
            <ProductCard product={product} srdRate={srdRate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bundles as blocks: name, what is in it, price. Only when the owner switched it on. */
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
      <ul className="nx-reveal mt-5 grid gap-3 sm:mt-8 md:grid-cols-2">
        {bundles.map((bundle) => (
          <li key={bundle.id}>
            <Link
              href={`/setups/${bundle.slug}` as never}
              className={cn(
                'group flex h-full items-end justify-between gap-6 rounded-[20px] bg-sunken p-5 transition-colors hover:bg-hover sm:p-7',
                FOCUS,
              )}
            >
              <span className="min-w-0">
                <span className="nx-display block text-[clamp(22px,2.4vw,32px)]">
                  {bundle.name}
                </span>
                {bundle.summary ? (
                  <span className="mt-2 block max-w-[48ch] text-[14px] text-ink-2">
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
 * An orange band of type under the hero. The first copy is the real list; the second is hidden from
 * assistive technology and only exists so the loop has no seam. Without motion (reduced motion, no CSS
 * animation) it is a still row that clips at the edge.
 */
function Ticker({ words }: { words: string[] }) {
  if (words.length < 3) return null;
  const row = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : 'What the shop carries'}
      className="flex shrink-0 items-center"
    >
      {words.map((word) => (
        <li key={word} className="flex items-center whitespace-nowrap">
          <span className="nx-display px-5 text-[clamp(22px,3vw,40px)] sm:px-8">{word}</span>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-[#0e0d0c] sm:size-2.5"
          />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="overflow-hidden bg-store-bright py-4 text-[#0e0d0c] sm:py-6">
      <div className="nx-marquee flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * How an order works here, as the agency site shows its own process: heavy words joined by orange
 * arrows and one line under them. Only what the cart really does: it writes the WhatsApp message, and
 * nothing is final until the shop has confirmed price and stock.
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
  const last = pickup && delivery ? 'Pickup or delivery' : delivery ? 'Delivery' : 'Pickup';
  const steps = ['Cart', 'WhatsApp', 'Confirmed', last];
  return (
    <section aria-labelledby="home-ordering" className={cn(SECTION, SECTION_GAP, 'nx-cv')}>
      <div className="nx-reveal">
        <h2 id="home-ordering" className="font-semibold text-[15px] text-ink-2">
          How ordering works
        </h2>
        <p className="nx-flow mt-6 sm:mt-8">
          {steps.map((step, index) => (
            <Fragment key={step}>
              {index > 0 ? <Arrow /> : null}
              <span>{step}</span>
            </Fragment>
          ))}
        </p>
        <p className="mt-6 max-w-[36rem] text-[17px] text-ink-2 leading-[1.45] sm:mt-8 sm:text-[20px]">
          The cart writes the WhatsApp message for you. {businessName} confirms price and stock
          before anything is final.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * Pickup places, hours, payment, delivery and phone: one ink block, each fact only when the owner has
 * entered it, and no block at all when none are. Full width, so it never has to match another card's height.
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
      className={cn(SECTION, SECTION_GAP, 'nx-cv scroll-mt-0 sm:scroll-mt-24')}
    >
      <div className="nx-ink nx-reveal rounded-[28px] p-6 sm:p-10 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:p-14">
        <h2 id="home-pickup" className={SECTION_TITLE}>
          Pickup and contact
        </h2>
        <dl className="mt-7 grid gap-x-10 gap-y-7 text-[16px] sm:grid-cols-2 lg:mt-2">
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
                <p className="mt-1 text-ink-3">{publicText(settings.pickupDetails)}</p>
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
                      <span className="text-ink-3"> · {publicText(method.details)}</span>
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
                className="nx-link-line py-1 focus-visible:outline-2 focus-visible:outline-ring"
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
    <div className="min-w-0">
      <dt className="font-semibold text-[13px] text-ink-4">{label}</dt>
      <dd className="mt-2 text-ink">{children}</dd>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1320px] px-4 min-h-[100svh] pt-6 lg:px-8"
      aria-hidden="true"
    >
      <div className="grid gap-8 lg:grid-cols-2">
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
