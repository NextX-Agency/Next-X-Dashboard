import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { CategoryChips } from '@/components/store/category-chips';
import { ProductCard } from '@/components/store/product-card';
import { LOW_STOCK_AT } from '@/components/store/stock-pill';
import { StorePrice } from '@/components/store/store-price';
import { Skeleton } from '@/components/ui/skeleton';
import { publicText } from '@/lib/english-content';
import { assortmentMessage } from '@/lib/store-messages';
import { plural } from '@/lib/store-money';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import {
  listCatalogBundles,
  listCatalogCategories,
  listCatalogProducts,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

/** Products shown on the home page. The rest are one tap away in the shop. */
const HOME_PRODUCTS = 8;

/**
 * The home page is the shop, not a banner about the shop: categories as filter chips, the plain facts a
 * customer needs (how to order, how to pay, where to collect), the real "last pieces", then the
 * products. Nothing here names a product family.
 */
export function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const [products, categories, settings, storefront, rate] = await Promise.all([
    listCatalogProducts({ sort: 'newest' }),
    listCatalogCategories(),
    getSettings(),
    getRequestStorefront(),
    getCurrentRate(),
  ]);
  const srdRate = rate?.rateMicros;
  const lastPieces = products.filter(
    (product) => product.onHand > 0 && product.onHand <= LOW_STOCK_AT,
  );
  // Featured and in-stock products first, so the first row is always something a customer can buy.
  const shown = [...products]
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || Number(b.onHand > 0) - Number(a.onHand > 0),
    )
    .slice(0, HOME_PRODUCTS);

  const facts = [
    settings?.whatsapp ? 'Order via WhatsApp' : null,
    settings?.pickupEnabled
      ? publicText(settings.pickupLabel?.trim()) || 'Pickup available'
      : null,
    settings?.deliveryEnabled ? 'Delivery available' : null,
    `Prices in ${storefront?.defaultCurrency ?? 'SRD'}`,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-5 pb-16 lg:px-8 lg:pt-8 lg:pb-24">
      <h1 className="sr-only">{settings?.businessName ?? 'NextX'}: products and ordering</h1>
      <CategoryChips categories={categories} total={products.length} />

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-3">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>

      {lastPieces.length ? (
        <section
          aria-label="Low stock"
          className="mt-5 rounded-tile bg-accent-muted p-4 sm:flex sm:items-baseline sm:gap-6"
        >
          <h2 className="font-bold text-[14px] text-accent">Low stock</h2>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] sm:mt-0">
            {lastPieces.map((product) => (
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
        </section>
      ) : null}

      <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((product, index) => (
          <li key={product.id}>
            <ProductCard product={product} srdRate={srdRate} priority={index < 4} />
          </li>
        ))}
      </ul>

      {products.length > shown.length ? (
        <div className="mt-8 flex justify-center">
          <Link href={SHOP_PATH as never} className="nx-btn nx-btn-line px-8">
            View all {plural(products.length, 'product')} <ArrowRight />
          </Link>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <Sets srdRate={srdRate} />
      </Suspense>

      <HowOrdering
        pickup={Boolean(settings?.pickupEnabled)}
        delivery={Boolean(settings?.deliveryEnabled)}
        whatsapp={settings?.whatsapp ?? null}
        supportTitle={publicText(settings?.supportTitle?.trim()) || 'Need help choosing?'}
        supportBody={
          publicText(settings?.supportBody?.trim()) ||
          'Tell us what you are looking for and we will help you choose.'
        }
        businessName={settings?.businessName ?? 'NextX'}
      />
    </div>
  );
}

async function Sets({ srdRate }: { srdRate: number | undefined }) {
  const settings = await getSettings();
  if (!settings?.homepageFeaturedBundlesEnabled) return null;
  const bundles = await listCatalogBundles(settings.homepageFeaturedBundlesLimit);
  if (!bundles.length) return null;
  return (
    <section id="sets" className="mt-16 scroll-mt-24">
      <h2 className="nx-display text-[26px]">Bundles</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

function HowOrdering({
  pickup,
  delivery,
  whatsapp,
  supportTitle,
  supportBody,
  businessName,
}: {
  pickup: boolean;
  delivery: boolean;
  whatsapp: string | null;
  supportTitle: string;
  supportBody: string;
  businessName: string;
}) {
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
  const help = whatsappLink(whatsapp, assortmentMessage(businessName));
  return (
    <section
      id="how-ordering-works"
      className="mt-16 scroll-mt-24 rounded-tile bg-sunken p-5 sm:p-8"
    >
      <h2 className="nx-display text-[24px] sm:text-[28px]">How ordering works</h2>
      <ol className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([title, body], index) => (
          <li key={title}>
            <p className="grid size-8 place-items-center rounded-full bg-night font-bold text-[13px] text-night-ink">
              {index + 1}
            </p>
            <h3 className="mt-3 font-bold text-[16px]">{title}</h3>
            <p className="mt-1 text-[14px] text-ink-2 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>
      {help ? (
        <div className="mt-7 flex flex-col gap-4 border-line border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-[17px]">{supportTitle}</h3>
            <p className="mt-1 text-[14px] text-ink-2">{supportBody}</p>
          </div>
          <a
            href={help}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-primary shrink-0"
          >
            Send a message
          </a>
        </div>
      ) : null}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-5 lg:px-8" aria-hidden="true">
      <div className="flex gap-2">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-36 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {['a', 'b', 'c', 'd'].map((id) => (
          <Skeleton key={id} className="aspect-[3/4] rounded-tile" />
        ))}
      </div>
    </div>
  );
}
