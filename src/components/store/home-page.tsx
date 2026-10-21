import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductCard } from '@/components/store/product-card';
import { LOW_STOCK_AT } from '@/components/store/stock-pill';
import { StorePrice } from '@/components/store/store-price';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { publicText } from '@/lib/english-content';
import type { RateMicros } from '@/lib/fx';
import {
  accessoryShelf,
  type CategoryTile,
  categoryTiles,
  latestAdditions,
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
const SECTION_TITLE = 'nx-display text-[clamp(26px,3.4vw,38px)]';

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
  const lastPieces = products.filter(
    (product) => product.onHand > 0 && product.onHand <= LOW_STOCK_AT,
  );
  const help = whatsappLink(settings?.whatsapp, assortmentMessage(businessName));

  return (
    <div className="pb-16 lg:pb-24">
      <Hero
        settings={settings}
        showcase={showcase}
        srdRate={srdRate}
        businessName={businessName}
        currency={currency}
        whatsappHref={help}
      />

      {tiles.length ? (
        <CategoryTiles tiles={tiles} currency={currency} srdRate={srdRate} />
      ) : null}

      {latest.length ? (
        <Shelf
          id="latest"
          title="Latest additions"
          products={latest}
          srdRate={srdRate}
          action={{ href: SHOP_PATH, label: `View all ${plural(products.length, 'product')}` }}
        />
      ) : null}

      {lastPieces.length ? <LastPieces products={lastPieces} /> : null}

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
        <Sets srdRate={srdRate} />
      </Suspense>

      <OrderingAndVisit
        settings={settings}
        pickupLocations={pickupLocations}
        whatsappHref={help}
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
  whatsappHref,
}: {
  settings: Settings | null;
  showcase: CatalogListItem[];
  srdRate: RateMicros | undefined;
  businessName: string;
  currency: Currency;
  whatsappHref: string | null;
}) {
  const title =
    publicText(settings?.heroTitle?.trim()) || 'In-ear monitors and audio accessories.';
  const body =
    publicText(settings?.heroBody?.trim()) ||
    (settings?.pickupEnabled && whatsappHref
      ? 'Choose what you want, send your order on WhatsApp and collect it once it is confirmed.'
      : 'Browse the range, with real photographs, prices and stock.');
  const eyebrow = [businessName, settings?.city].filter(Boolean).join(' · ');
  const facts = [
    whatsappHref ? { icon: MessageCircle, text: 'Order on WhatsApp' } : null,
    settings?.pickupEnabled
      ? { icon: MapPin, text: publicText(settings.pickupLabel?.trim()) || 'Pickup available' }
      : null,
    settings?.deliveryEnabled ? { icon: Truck, text: 'Delivery available' } : null,
    { icon: Wallet, text: `Prices in ${currency}` },
  ].filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

  return (
    <section aria-labelledby="home-title" className={cn(SECTION, 'pt-6 lg:pt-10')}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-stretch lg:gap-12">
        <div className="flex flex-col justify-center lg:py-8">
          <p className="nx-label text-accent">{eyebrow}</p>
          <h1
            id="home-title"
            className="nx-display mt-4 text-[clamp(38px,5.6vw,72px)] leading-[0.98] text-ink"
          >
            {title}
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] text-ink-2 leading-relaxed">{body}</p>
          <div className="mt-6 flex gap-3 sm:mt-7">
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
          <ul className="mt-8 hidden flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2 sm:flex">
            {facts.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon aria-hidden="true" className="size-4 text-store-bright" />
                {text}
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
 * carries its name and price. Two products make a two-frame composition. Nothing here is decoration.
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
      aria-label="Featured products"
      className="grid grid-cols-2 gap-3 rounded-[28px] bg-store-bright p-3 md:min-h-[480px] md:grid-cols-12 md:grid-rows-6 md:p-5 lg:min-h-[540px]"
    >
      {frames.map(({ product, className, large }, index) => (
        <li key={product.id} className={cn('min-w-0', className)}>
          <Link
            href={storefrontProductPath(null, product.slug) as never}
            className="group flex h-full flex-col overflow-hidden rounded-[18px] bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span
              className={cn(
                'relative block min-h-0 flex-1',
                large ? 'aspect-[4/3] md:aspect-auto' : 'aspect-square md:aspect-auto',
              )}
            >
              {product.image ? (
                <Image
                  src={product.image.url}
                  alt=""
                  fill
                  priority={index === 0}
                  sizes={
                    large ? '(max-width: 768px) 90vw, 36vw' : '(max-width: 768px) 45vw, 22vw'
                  }
                  className="object-contain p-[6%] transition-transform duration-300 ease-out-instrument group-hover:scale-[1.03]"
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
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/**
 * The categories as places to go. Their number decides the layout: with three, one large tile and two
 * smaller ones; the tiles alternate soft grey and a warm tint so they are not copies of one card. Each
 * shows a real photograph of something in it and the real lowest price.
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
    <section aria-labelledby="home-categories" className={cn(SECTION, 'mt-16 lg:mt-24')}>
      <h2 id="home-categories" className={SECTION_TITLE}>
        Shop by category
      </h2>
      <ul
        className={cn(
          'mt-6 grid gap-3 sm:gap-4',
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
              'min-w-0',
              three && index === 0 && 'md:col-span-4 md:row-span-2',
              three && index > 0 && 'md:col-span-2',
            )}
          >
            <CategoryTileCard
              tile={tile}
              currency={currency}
              srdRate={srdRate}
              large={three && index === 0}
              tint={index % 2 === 1}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryTileCard({
  tile,
  currency,
  srdRate,
  large,
  tint,
}: {
  tile: CategoryTile;
  currency: Currency;
  srdRate: RateMicros | undefined;
  large: boolean;
  tint: boolean;
}) {
  // One photograph per tile: a second one stacked on the first, multiplied onto it, reads as a ghost.
  const [first] = tile.images;
  return (
    <Link
      href={`${SHOP_PATH}?category=${tile.slug}` as never}
      className={cn(
        'group relative flex h-full overflow-hidden rounded-[24px] p-5 transition-colors sm:p-7',
        tint ? 'bg-accent-muted hover:bg-[#ffe6d2]' : 'bg-sunken hover:bg-[#ecebe6]',
        large ? 'min-h-[260px] md:min-h-[420px]' : 'min-h-[200px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
      )}
    >
      <div className="relative z-10 flex max-w-[55%] flex-col">
        <h3
          className={cn(
            'nx-display text-ink',
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
            className="mt-2"
          />
        ) : null}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-6 font-semibold text-[14px] text-ink">
          Browse
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-1"
          />
        </span>
      </div>
      {first ? (
        <Image
          src={first.image.url}
          alt={first.productName}
          width={first.image.width}
          height={first.image.height}
          sizes={large ? '(max-width: 768px) 60vw, 34vw' : '(max-width: 768px) 50vw, 22vw'}
          className={cn(
            'absolute mix-blend-multiply transition-transform duration-300 ease-out-instrument group-hover:scale-[1.04]',
            large
              ? 'right-[-2%] bottom-[-4%] w-[62%] max-w-[460px]'
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
    <section aria-labelledby={`home-${id}`} className={cn(SECTION, 'mt-16 lg:mt-24')}>
      <div className="flex items-end justify-between gap-4">
        <h2 id={`home-${id}`} className={SECTION_TITLE}>
          {title}
        </h2>
        <Link
          href={action.href as never}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 font-semibold text-[14px] text-ink underline-offset-4 hover:underline"
        >
          {action.label} <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} srdRate={srdRate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LastPieces({ products }: { products: CatalogListItem[] }) {
  return (
    <section aria-label="Low stock" className={cn(SECTION, 'mt-10')}>
      <div className="flex flex-col gap-2 rounded-tile bg-accent-muted p-4 sm:flex-row sm:items-baseline sm:gap-6">
        <h2 className="font-bold text-[14px] text-accent">Last pieces</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[14px]">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={storefrontProductPath(null, product.slug) as never}
                className="font-medium underline-offset-4 hover:underline"
              >
                {product.name}
              </Link>{' '}
              <span className="text-accent">· Only {product.onHand} left</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function Sets({ srdRate }: { srdRate: RateMicros | undefined }) {
  const settings = await getSettings();
  if (!settings?.homepageFeaturedBundlesEnabled) return null;
  const bundles = await listCatalogBundles(settings.homepageFeaturedBundlesLimit);
  if (!bundles.length) return null;
  return (
    <section
      id="sets"
      aria-labelledby="home-bundles"
      className={cn(SECTION, 'mt-16 scroll-mt-24 lg:mt-24')}
    >
      <h2 id="home-bundles" className={SECTION_TITLE}>
        Bundles
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bundles.map((bundle) => (
          <li key={bundle.id}>
            <Link
              href={`/setups/${bundle.slug}` as never}
              className="flex h-full flex-col gap-2 rounded-tile border border-line bg-raised p-5 hover:shadow-overlay"
            >
              <span className="font-bold text-[17px]">{bundle.name}</span>
              {bundle.summary ? (
                <span className="text-[14px] text-ink-3">{bundle.summary}</span>
              ) : null}
              <span className="mt-auto pt-3">
                <StorePrice usdCents={bundle.priceCents} srdRate={srdRate} size="md" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------------ */

/** Hours, payment, delivery and pickup places are shown only when the owner has entered them. */
function OrderingAndVisit({
  settings,
  pickupLocations,
  whatsappHref,
  businessName,
}: {
  settings: Settings | null;
  pickupLocations: { id: string; name: string }[];
  whatsappHref: string | null;
  businessName: string;
}) {
  const pickup = Boolean(settings?.pickupEnabled);
  const delivery = Boolean(settings?.deliveryEnabled);
  const collection =
    pickup && delivery
      ? 'Collect your order, or arrange delivery.'
      : pickup
        ? 'Collect your order once it is confirmed.'
        : delivery
          ? 'Arrange delivery with NextX.'
          : 'Confirm pickup or delivery with NextX.';
  const steps: [string, string][] = [
    ['Choose', 'Add the products you want to your cart.'],
    ['Send', 'Send your cart to NextX on WhatsApp.'],
    [
      'Confirmation',
      'NextX confirms price and stock. Your order is only final once confirmed.',
    ],
    ['Receive', collection],
  ];
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
  const hasVisitFacts = Boolean(
    pickupLocations.length ||
      settings?.addressLine ||
      settings?.openingHours ||
      payments.length ||
      delivery ||
      settings?.phone,
  );
  const supportTitle = publicText(settings?.supportTitle?.trim()) || 'Need help choosing?';
  const supportBody =
    publicText(settings?.supportBody?.trim()) ||
    'Tell us what you are looking for and we will help you choose.';

  return (
    <section
      id="how-ordering-works"
      aria-labelledby="home-ordering"
      className={cn(SECTION, 'mt-16 scroll-mt-24 lg:mt-24')}
    >
      <div
        className={cn(
          'grid gap-4',
          hasVisitFacts && 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
        )}
      >
        <div className="rounded-[24px] bg-sunken p-6 sm:p-9">
          <h2 id="home-ordering" className="nx-display text-[clamp(24px,3vw,32px)]">
            How ordering works
          </h2>
          <ol className="mt-6 grid gap-6 sm:grid-cols-2">
            {steps.map(([title, body], index) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cta font-bold text-[14px] text-cta-fg">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-bold text-[16px]">{title}</span>
                  <span className="mt-1 block text-[14px] text-ink-2 leading-relaxed">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {whatsappHref ? (
            <div className="mt-8 flex flex-col gap-4 border-line border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-[17px]">{supportTitle}</h3>
                <p className="mt-1 text-[14px] text-ink-2">{supportBody}</p>
              </div>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-primary shrink-0"
              >
                <MessageCircle /> Send a message
              </a>
            </div>
          ) : null}
        </div>

        {hasVisitFacts ? (
          <aside
            aria-label={`Visit ${businessName}`}
            className="self-start rounded-[24px] bg-night p-6 text-night-ink sm:p-9"
          >
            <h2 className="nx-display text-[clamp(24px,3vw,32px)]">Pickup and contact</h2>
            <dl className="mt-6 space-y-5 text-[14px]">
              {pickupLocations.length || settings?.addressLine ? (
                <VisitRow icon={MapPin} label="Pickup">
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
                    <p className="mt-1 text-night-ink-2">
                      {publicText(settings.pickupDetails)}
                    </p>
                  ) : null}
                </VisitRow>
              ) : null}
              {settings?.openingHours ? (
                <VisitRow icon={Clock} label="Opening hours">
                  {publicText(settings.openingHours)}
                </VisitRow>
              ) : null}
              {payments.length ? (
                <VisitRow icon={Wallet} label="Payment">
                  <ul>
                    {payments.map((method) => (
                      <li key={method.name}>
                        {publicText(method.name)}
                        {method.details ? (
                          <span className="text-night-ink-2">
                            {' '}
                            · {publicText(method.details)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </VisitRow>
              ) : null}
              {delivery ? (
                <VisitRow icon={Truck} label="Delivery">
                  {deliveryLine || 'Available. Ask NextX for the details.'}
                </VisitRow>
              ) : null}
              {settings?.phone ? (
                <VisitRow icon={Phone} label="Call">
                  <a
                    href={`tel:${settings.phone.replace(/[^\d+]/g, '')}`}
                    className="underline underline-offset-4"
                  >
                    {settings.phone}
                  </a>
                </VisitRow>
              ) : null}
            </dl>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function VisitRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-store-bright" />
      <div className="min-w-0">
        <dt className="font-semibold text-[12px] text-night-ink-2 uppercase tracking-[0.08em]">
          {label}
        </dt>
        <dd className="mt-1">{children}</dd>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-6 lg:px-8" aria-hidden="true">
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
