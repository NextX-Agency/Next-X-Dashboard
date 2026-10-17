import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { ProductCard } from '@/components/store/product-card';
import { StorePrice } from '@/components/store/store-price';
import { Skeleton } from '@/components/ui/skeleton';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappLink } from '@/lib/whatsapp';
import {
  type CatalogListItem,
  listCatalogBundles,
  listCatalogCategories,
  listCatalogProducts,
} from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

/** Placeholder greetings from the legacy shop ("Welkom") say nothing about the offer. */
const GENERIC_GREETING = /^\s*(welkom|welcome)\b/i;

/**
 * The NextX home page. The first screen is one real product on a charcoal
 * stage, large, with its price and a single way in. Below it: categories (only
 * when there is a real choice), a short curated set of products, sets, and how
 * ordering works. Everything is derived from published data; nothing here names
 * a product family.
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
  const inStock = products.filter((product) => product.onHand > 0 && product.image);
  const hero =
    inStock.find((product) => product.featured) ?? inStock[0] ?? products.find((p) => p.image);
  const rest = products.filter((product) => product.id !== hero?.id);
  const featured = [...rest]
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) || Number(b.onHand > 0) - Number(a.onHand > 0),
    )
    .slice(0, 8);
  const hasFeatured = featured.some((product) => product.featured);

  const configuredTitle = storefront?.heroTitle?.trim() || settings?.heroTitle?.trim() || '';
  const headline =
    configuredTitle && !GENERIC_GREETING.test(configuredTitle) ? configuredTitle : null;
  const intro = storefront?.heroSubtitle?.trim() || settings?.heroBody?.trim() || null;

  return (
    <>
      <Hero
        product={hero ?? null}
        headline={headline}
        intro={intro}
        srdRate={srdRate}
        facts={[
          products.length
            ? `${products.length} ${products.length === 1 ? 'product' : 'producten'}`
            : null,
          `Prijzen in ${storefront?.defaultCurrency ?? 'SRD'}`,
          settings?.pickupEnabled ? settings.pickupLabel?.trim() || 'Ophalen mogelijk' : null,
          settings?.deliveryEnabled ? 'Bezorgen mogelijk' : null,
          settings?.whatsapp ? 'Bestellen via WhatsApp' : null,
        ].filter((fact): fact is string => Boolean(fact))}
      />

      {categories.length >= 2 ? (
        <CategoryTiles categories={categories} products={products} />
      ) : null}

      {featured.length ? (
        <section className="mx-auto w-full max-w-[1320px] px-4 py-16 lg:px-8 lg:py-24">
          <SectionHeading
            index={categories.length >= 2 ? '02' : '01'}
            title={hasFeatured ? 'Uitgelicht' : 'Nieuw in de winkel'}
            action={{ href: SHOP_PATH, label: `Alle ${products.length} producten` }}
          />
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 lg:gap-x-6">
            {featured.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                srdRate={srdRate}
                priority={index < 4}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Suspense fallback={null}>
        <Sets srdRate={srdRate} />
      </Suspense>

      <HowOrdering
        pickup={Boolean(settings?.pickupEnabled)}
        delivery={Boolean(settings?.deliveryEnabled)}
        whatsapp={settings?.whatsapp ?? null}
        supportTitle={settings?.supportTitle?.trim() || 'Hulp bij kiezen?'}
        supportBody={
          settings?.supportBody?.trim() || 'Vertel ons wat je zoekt, dan helpen we je kiezen.'
        }
        businessName={settings?.businessName ?? 'NextX'}
      />
    </>
  );
}

function Hero({
  product,
  headline,
  intro,
  srdRate,
  facts,
}: {
  product: CatalogListItem | null;
  headline: string | null;
  intro: string | null;
  srdRate: number | undefined;
  facts: string[];
}) {
  const inStock = product ? product.onHand > 0 : false;
  const context = product
    ? [product.brandName, product.categoryName].filter(Boolean).join(' · ')
    : '';
  const title = headline ?? product?.name ?? 'NextX';
  return (
    <section className="bg-night text-night-ink">
      <div className="mx-auto grid w-full max-w-[1320px] lg:min-h-[min(720px,calc(100svh-4rem))] lg:grid-cols-12">
        <div className="flex flex-col justify-end px-4 pt-10 pb-12 lg:col-span-5 lg:px-8 lg:pt-20 lg:pb-16">
          <p className="nx-label text-night-ink-2">
            {headline && product ? 'Uitgelicht' : context || 'NextX'}
          </p>
          <h1 className="nx-display mt-5 text-[clamp(44px,9.5vw,64px)] text-night-ink sm:text-[clamp(52px,8vw,96px)] lg:text-[clamp(48px,5.6vw,92px)]">
            {title}
          </h1>
          {headline && product ? (
            <p className="mt-4 text-[17px] font-medium text-night-ink">{product.name}</p>
          ) : null}
          {intro ? (
            <p className="mt-4 max-w-[44ch] text-[16px] text-night-ink-2 leading-relaxed">
              {intro}
            </p>
          ) : product?.summary ? (
            <p className="mt-5 max-w-[44ch] text-[16px] text-night-ink-2 leading-relaxed">
              {product.summary}
            </p>
          ) : null}

          {product ? (
            <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-4">
              <StorePrice
                amountCents={product.minPriceCents}
                currency={product.priceCurrency}
                srdRate={srdRate}
                size="xl"
                tone="night"
                prefix={product.maxPriceCents > product.minPriceCents ? 'vanaf' : undefined}
              />
              <p className="flex items-center gap-2 pb-0.5 text-[13px] text-night-ink-2">
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${inStock ? 'bg-store-bright' : 'bg-night-ink-2'}`}
                />
                {inStock ? 'Op voorraad' : 'Niet op voorraad'}
              </p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            {product ? (
              <Link
                href={storefrontProductPath(null, product.slug) as never}
                className="nx-btn nx-btn-orange h-12 px-6"
              >
                Bekijk product <ArrowRight />
              </Link>
            ) : null}
            <Link href={SHOP_PATH as never} className="nx-btn nx-btn-line-night h-12 px-6">
              Alle producten
            </Link>
          </div>
        </div>

        {product?.image ? (
          <div className="nx-stage nx-ticks relative order-first aspect-[4/3] bg-night-2 sm:aspect-[16/9] lg:order-last lg:col-span-7 lg:aspect-auto">
            <Image
              src={product.image.url}
              alt={product.image.alt ?? product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 58vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 hidden w-24 bg-gradient-to-r from-night to-transparent lg:block"
            />
          </div>
        ) : null}
      </div>

      {facts.length ? (
        <div className="border-night-line border-t">
          <ul className="nx-label mx-auto flex w-full max-w-[1320px] flex-wrap gap-x-8 gap-y-2 px-4 py-4 text-night-ink-2 lg:px-8">
            {facts.map((fact) => (
              <li key={fact} className="flex items-center gap-2">
                <span aria-hidden="true" className="size-1 bg-store-bright" />
                {fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SectionHeading({
  index,
  title,
  action,
}: {
  index: string;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-end justify-between gap-6 border-line border-b pb-4">
      <div>
        <p className="nx-label text-ink-3">{index}</p>
        <h2 className="nx-display mt-2 text-[clamp(28px,4vw,44px)] text-ink">{title}</h2>
      </div>
      {action ? (
        <Link
          href={action.href as never}
          className="inline-flex items-center gap-1.5 pb-1 text-[14px] font-semibold text-ink underline-offset-4 hover:text-accent hover:underline"
        >
          {action.label} <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

/** Category entry points: one tile per category that actually has products, each shown with one of its own. */
function CategoryTiles({
  categories,
  products,
}: {
  categories: { slug: string; name: string; count: number }[];
  products: CatalogListItem[];
}) {
  const tiles = categories.slice(0, 4).map((category) => ({
    ...category,
    image:
      products.find((product) => product.categorySlug === category.slug && product.image)
        ?.image ?? null,
  }));
  return (
    <section className="mx-auto w-full max-w-[1320px] px-4 pt-16 lg:px-8 lg:pt-24">
      <SectionHeading index="01" title="Winkel per categorie" />
      <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        {tiles.map((tile, index) => (
          <li key={tile.slug}>
            <Link
              href={`${SHOP_PATH}?category=${tile.slug}` as never}
              className="nx-stage group relative block aspect-[4/5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {tile.image ? (
                <Image
                  src={tile.image.url}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 ease-out-instrument group-hover:scale-[1.05]"
                />
              ) : null}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-night via-night/30 to-transparent"
              />
              <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5">
                <p className="nx-label text-night-ink-2">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <p className="nx-display mt-1.5 text-[20px] text-night-ink sm:text-[24px]">
                  {tile.name}
                </p>
                <p className="mt-2 flex items-center justify-between text-[13px] text-night-ink-2">
                  {tile.count} {tile.count === 1 ? 'product' : 'producten'}
                  <ArrowRight className="size-4 text-store-bright transition-transform group-hover:translate-x-1" />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Sets({ srdRate }: { srdRate: number | undefined }) {
  const settings = await getSettings();
  if (!settings?.homepageFeaturedBundlesEnabled) return null;
  const bundles = await listCatalogBundles(settings.homepageFeaturedBundlesLimit);
  if (!bundles.length) return null;
  return (
    <section id="sets" className="scroll-mt-20 bg-night text-night-ink">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-16 lg:px-8 lg:py-24">
        <p className="nx-label text-night-ink-2">Sets</p>
        <h2 className="nx-display mt-2 text-[clamp(28px,4vw,44px)]">
          Alles voor een complete start
        </h2>
        <ul className="mt-8 divide-y divide-night-line border-night-line border-y">
          {bundles.map((bundle) => (
            <li key={bundle.id}>
              <Link
                href={`/setups/${bundle.slug}` as never}
                className="group grid items-center gap-3 py-6 sm:grid-cols-[1fr_auto_auto] sm:gap-10"
              >
                <div className="min-w-0">
                  <h3 className="text-[20px] font-semibold tracking-[-0.01em] group-hover:text-store-bright">
                    {bundle.name}
                  </h3>
                  {bundle.summary ? (
                    <p className="mt-1 max-w-[60ch] text-[14px] text-night-ink-2">
                      {bundle.summary}
                    </p>
                  ) : null}
                </div>
                <p className="text-[13px] text-night-ink-2">
                  {bundle.availability > 0
                    ? `${bundle.availability} ${bundle.availability === 1 ? 'set' : 'sets'} beschikbaar`
                    : 'Momenteel niet beschikbaar'}
                </p>
                <StorePrice
                  usdCents={bundle.priceCents}
                  srdRate={srdRate}
                  size="lg"
                  tone="night"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
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
      ? 'Haal je bestelling op of spreek bezorging af.'
      : pickup
        ? 'Haal je bestelling op na bevestiging.'
        : delivery
          ? 'Spreek bezorging af met NextX.'
          : 'Bevestig ophalen of bezorgen met NextX.';
  const steps: [string, string][] = [
    ['Kies', 'Kies het product dat bij je past en zet het in je winkelwagen.'],
    ['Verstuur', 'Stuur je winkelwagen of een vraag via WhatsApp naar NextX.'],
    [
      'Bevestiging',
      'NextX bevestigt prijs en voorraad. Pas daarna is je bestelling definitief.',
    ],
    ['Ontvangen', collection],
  ];
  const help = whatsappLink(
    whatsapp,
    `Hallo ${businessName}, ik heb een vraag over jullie assortiment.`,
  );
  return (
    <section
      id="bestellen"
      className="mx-auto w-full max-w-[1320px] scroll-mt-20 px-4 py-16 lg:px-8 lg:py-24"
    >
      <SectionHeading index="Zo bestel je" title="Vier stappen, via WhatsApp" />
      <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([title, body], index) => (
          <li key={title} className="border-line border-t pt-4">
            <p className="nx-label text-accent">{String(index + 1).padStart(2, '0')}</p>
            <h3 className="mt-3 text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
            <p className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>
      {help ? (
        <div className="mt-14 flex flex-col gap-5 border-ink border-y-2 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="nx-display text-[clamp(24px,3vw,34px)]">{supportTitle}</h3>
            <p className="mt-2 max-w-[52ch] text-[15px] text-ink-2">{supportBody}</p>
          </div>
          <a
            href={help}
            target="_blank"
            rel="noopener noreferrer"
            className="nx-btn nx-btn-orange h-12 shrink-0 px-6"
          >
            Stuur een bericht
          </a>
        </div>
      ) : null}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="bg-night">
        <div className="mx-auto grid w-full max-w-[1320px] lg:min-h-[640px] lg:grid-cols-12">
          <div className="space-y-5 px-4 py-14 lg:col-span-5 lg:px-8">
            <Skeleton className="h-3 w-32 bg-night-line" />
            <Skeleton className="h-24 w-4/5 bg-night-line" />
            <Skeleton className="h-4 w-3/5 bg-night-line" />
          </div>
          <Skeleton className="aspect-[4/3] rounded-none bg-night-2 lg:col-span-7 lg:aspect-auto" />
        </div>
      </div>
    </div>
  );
}
