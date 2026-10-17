import { ChevronDown } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { QuoteRequestForm } from '@/components/forms/quote-request-form';
import { ProductGallery } from '@/components/store/product-gallery';
import { ProductOrderPanel } from '@/components/store/product-order-panel';
import { publicParagraphs, publicSpecs, publicText } from '@/lib/english-content';
import { isStagingEnvironment, publicAppUrl } from '@/lib/env';
import { cardSummary } from '@/lib/public-copy';
import { variantLabel } from '@/lib/store-messages';
import {
  SHOP_PATH,
  storefrontProductPath,
  storefrontPublicOrigin,
} from '@/lib/storefront-domain';
import { type CatalogProduct, getCatalogProduct } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront, getStorefrontAvailability } from '@/server/services/storefront';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  // Unknown slugs render the not-found page; it must never be indexed.
  if (!product) return { title: 'Product not found', robots: { index: false, follow: false } };

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? metaDescription(product) ?? undefined,
    alternates: { canonical: storefrontProductPath(null, product.slug) },
    openGraph: {
      type: 'website',
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? metaDescription(product) ?? undefined,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

/** A search-result description from the first paragraph of the (English) copy, when the owner wrote none. */
function metaDescription(product: CatalogProduct): string | undefined {
  const source = product.summary ?? publicParagraphs(product.description)[0];
  const text = cardSummary(source, product.name);
  return text ?? undefined;
}

// The product is read before anything is sent, not behind a Suspense boundary, so an
// unknown slug answers a real HTTP 404 instead of a streamed 200 with a not-found body.
export const instant = false;

/** Stock per pickup location, summed over the product's variants. Empty when pickup is off. */
async function pickupStock(storefrontId: string | undefined, product: CatalogProduct) {
  if (!storefrontId) return [];
  const perVariant = await Promise.all(
    product.variants.map((variant) => getStorefrontAvailability(storefrontId, variant.id)),
  );
  const byLocation = new Map<string, { name: string; available: number }>();
  for (const availability of perVariant) {
    for (const location of availability.locations) {
      const existing = byLocation.get(location.locationId);
      byLocation.set(location.locationId, {
        name: location.locationName,
        available: (existing?.available ?? 0) + location.available,
      });
    }
  }
  return [...byLocation.values()];
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, rate, settings, storefront] = await Promise.all([
    getCatalogProduct(slug),
    getCurrentRate(),
    getSettings(),
    getRequestStorefront(),
  ]);

  // The query already filters to published, active products: a slug that is
  // not in the catalog is simply not here.
  if (!product) notFound();
  // Legacy ids and old slugs answer with one permanent hop to the canonical URL.
  if (slug !== product.slug)
    permanentRedirect(storefrontProductPath(null, product.slug) as never);

  const locations = storefront?.allowPickup ? await pickupStock(storefront.id, product) : [];
  const srdRate = rate?.rateMicros;
  const whatsapp = settings?.whatsapp ?? null;
  const paragraphs = publicParagraphs(product.description);
  const specs = publicSpecs(product.specs);
  const blurb = cardSummary(product.summary, product.name);
  const showBrand =
    product.brandName &&
    !product.name.toLowerCase().startsWith(product.brandName.toLowerCase());
  const context = [showBrand ? product.brandName : null, product.categoryName]
    .filter(Boolean)
    .join(' · ');
  // Structured data needs absolute URLs. A placeholder variant name ("Default") is left out.
  const origin = storefrontPublicOrigin(
    storefront?.domain,
    publicAppUrl(),
    isStagingEnvironment(),
  );
  const absolute = (path: string) => new URL(path, origin).toString();
  const productUrl = absolute(storefrontProductPath(null, product.slug));
  const offers = product.variants
    .filter((variant) => variant.listPriceCents > 0)
    .map((variant) => ({
      '@type': 'Offer',
      url: productUrl,
      sku: variant.sku,
      ...(variantLabel(variant.name) ? { name: variantLabel(variant.name) } : {}),
      priceCurrency: variant.priceCurrency,
      price: (variant.listPriceCents / 100).toFixed(2),
      availability:
        variant.onHand > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
    }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: productUrl,
    description: product.seoDescription ?? metaDescription(product),
    image: product.images.map((image) => absolute(image.url)),
    brand: product.brandName ? { '@type': 'Brand', name: product.brandName } : undefined,
    ...(offers.length ? { offers } : {}),
  };
  // Product fields are editable by staff. Escaping '<' prevents a catalog
  // value containing </script> from terminating the JSON-LD script element.
  const jsonLdText = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  const hasDetails =
    paragraphs.length > 0 ||
    product.keyFeatures.length > 0 ||
    product.boxContents.length > 0 ||
    Boolean(product.nextlyTake);

  return (
    <article className="mx-auto w-full max-w-[1320px] px-4 pt-4 pb-28 sm:pb-20 lg:px-8 lg:pt-8 lg:pb-24">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be emitted as a script element; the serialised value escapes '<' above.
        dangerouslySetInnerHTML={{ __html: jsonLdText }}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-3"
      >
        <Link href={SHOP_PATH as never} className="-my-3 py-3 hover:text-ink hover:underline">
          Shop
        </Link>
        {product.categoryName ? (
          <>
            <span aria-hidden="true">/</span>
            {product.categorySlug ? (
              <Link
                href={`${SHOP_PATH}?category=${product.categorySlug}` as never}
                className="-my-3 py-3 hover:text-ink hover:underline"
              >
                {product.categoryName}
              </Link>
            ) : (
              <span>{product.categoryName}</span>
            )}
          </>
        ) : null}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
        <ProductGallery images={product.images} name={product.name} />

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          {context ? <p className="font-semibold text-[14px] text-ink-3">{context}</p> : null}
          <h1 className="nx-display mt-1 text-[clamp(28px,3.6vw,42px)]">{product.name}</h1>
          {blurb ? (
            <p className="mt-3 max-w-[52ch] text-[15px] text-ink-2 leading-relaxed">{blurb}</p>
          ) : null}

          <div className="mt-6">
            <ProductOrderPanel
              productId={product.id}
              productSlug={product.slug}
              productName={product.name}
              businessName={settings?.businessName ?? 'NextX'}
              variants={product.variants}
              srdRate={srdRate}
              whatsapp={whatsapp}
              restockNotificationsEnabled={product.restockNotificationsEnabled}
            />
          </div>

          {locations.length ? (
            <section className="mt-6 rounded-tile border border-line p-4 sm:p-5">
              <h2 className="font-bold text-[14px]">Pickup: stock by location</h2>
              <ul className="mt-3 space-y-3">
                {locations.map((location) => (
                  <li
                    key={location.name}
                    className="flex items-center justify-between gap-4 text-[14px]"
                  >
                    <span className="font-semibold">{location.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 font-semibold text-[12px] ${
                        location.available > 0
                          ? 'bg-positive-muted text-positive'
                          : 'bg-sunken text-ink-3'
                      }`}
                    >
                      {location.available > 0 ? `${location.available} available` : 'No stock'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <GettingOrder
            settings={settings}
            warrantyMonths={product.warrantyMonths}
            hasLocations={locations.length > 0}
          />

          {/* The alternative channel for visitors who would rather type an enquiry than open
              WhatsApp. It files a quote request against this product; owners answer from /quotes. */}
          <details className="group mt-4 border-line border-t py-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-semibold text-[14px] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              Or request a quote
              <ChevronDown
                aria-hidden="true"
                className="size-4 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="mt-4">
              <QuoteRequestForm productId={product.id} productName={product.name} />
            </div>
          </details>
        </div>
      </div>

      {hasDetails || specs.length > 0 ? (
        <div className="mt-12 grid gap-10 border-line border-t pt-10 lg:mt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
          {hasDetails ? (
            <div className="space-y-8">
              {paragraphs.length > 0 ? (
                <section>
                  <Heading>Description</Heading>
                  <div className="mt-4 max-w-[62ch] space-y-4">
                    {paragraphs.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 48)}
                        className="text-[16px] text-ink-2 leading-[1.7]"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
              {product.keyFeatures.length ? (
                <ListSection title="Key features" values={product.keyFeatures} />
              ) : null}
              {product.nextlyTake ? (
                <section>
                  <Heading>Our take</Heading>
                  <p className="mt-3 max-w-[60ch] text-[15px] text-ink-2 leading-relaxed">
                    {product.nextlyTake}
                  </p>
                </section>
              ) : null}
              {product.boxContents.length ? (
                <ListSection title="What’s in the box" values={product.boxContents} />
              ) : null}
            </div>
          ) : null}

          <div className={`space-y-8 ${hasDetails ? '' : 'lg:col-span-2 lg:max-w-2xl'}`}>
            {specs.length > 0 ? (
              <section>
                <Heading>Specifications</Heading>
                <dl className="mt-4 divide-y divide-line border-line border-y">
                  {specs.map(([name, value]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3"
                    >
                      <dt className="text-[14px] text-ink-3">{name}</dt>
                      <dd className="font-semibold text-[14px] text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            <Compatibility product={product} />
            <Requirements values={product.buyerRequirements} />
          </div>
        </div>
      ) : null}

      {product.faqItems.length ? (
        <section className="mt-12 max-w-3xl">
          <Heading>Frequently asked questions</Heading>
          <div className="mt-4 divide-y divide-line border-line border-y">
            {product.faqItems.map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="cursor-pointer list-none font-bold text-[15px] text-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                </summary>
                <p className="mt-2 max-w-[62ch] text-[15px] text-ink-2 leading-relaxed">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <RelatedProducts items={product.related} />
    </article>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="nx-display text-[22px]">{children}</h2>;
}

function Compatibility({ product }: { product: CatalogProduct }) {
  const worksWith = [...product.compatibility.platforms, ...product.compatibility.ecosystems];
  const connection = product.compatibility.protocols;
  if (!worksWith.length && !connection.length) return null;
  return (
    <section>
      <Heading>Compatibility</Heading>
      <div className="mt-4 space-y-4">
        <Chips label="Works with" values={worksWith} />
        <Chips label="Connection" values={connection} />
      </div>
    </section>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <p className="font-semibold text-[13px] text-ink-3">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <li
            key={value}
            className="rounded-full border border-line-strong px-3 py-1 text-[13px] text-ink"
          >
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListSection({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <Heading>{title}</Heading>
      <ul className="mt-4 divide-y divide-line border-line border-y">
        {values.map((value) => (
          <li key={value} className="flex gap-3 py-3 text-[15px] text-ink-2">
            <span
              aria-hidden="true"
              className="mt-2 size-1.5 shrink-0 rounded-full bg-store-bright"
            />
            {value}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Join sentence fragments so each one ends in punctuation, whatever the owner typed. */
function sentences(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

function GettingOrder({
  settings,
  warrantyMonths,
  hasLocations,
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  warrantyMonths: number;
  hasLocations: boolean;
}) {
  const methods = settings?.paymentMethods ?? [];
  const rows: { label: string; body: string }[] = [];
  if (settings?.pickupEnabled && !hasLocations) {
    rows.push({
      label: 'Pickup',
      body: sentences([
        publicText(settings.pickupLabel),
        publicText(settings.pickupDetails),
        settings.sameDayPickupEnabled
          ? `Same-day pickup${settings.pickupCutoffTime ? ` before ${settings.pickupCutoffTime}` : ''}`
          : null,
      ]),
    });
  }
  if (settings?.deliveryEnabled) {
    rows.push({
      label: 'Delivery',
      body: sentences([
        publicText(settings.deliveryDetails),
        publicText(settings.deliveryAreas),
        publicText(settings.deliveryFeeDisplay),
        publicText(settings.deliveryEstimateDisplay),
      ]),
    });
  }
  if (methods.length) {
    rows.push({
      label: 'Payment',
      body: methods
        .map((method) => (method.details ? `${method.name} (${method.details})` : method.name))
        .join(' · '),
    });
  }
  if (warrantyMonths > 0) {
    rows.push({
      label: 'Warranty',
      body: `${warrantyMonths} ${warrantyMonths === 1 ? 'month' : 'months'} from the date of purchase.`,
    });
  }
  const visible = rows.filter((row) => row.body);
  if (!visible.length) return null;
  return (
    <dl className="mt-5 divide-y divide-line border-line border-y">
      {visible.map((row) => (
        <div key={row.label} className="grid grid-cols-[88px_1fr] gap-4 py-3.5">
          <dt className="font-semibold text-[13px] text-ink-3">{row.label}</dt>
          <dd className="text-[14px] text-ink-2 leading-relaxed">{row.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function Requirements({ values }: { values: Record<string, unknown> }) {
  const labels: Record<string, string> = {
    hubRequired: 'Hub required',
    hubName: 'Hub',
    appRequired: 'App required',
    appName: 'App',
    accountRequired: 'Account required',
    wifiRequired: 'Wi-Fi required',
    wifiBands: 'Wi-Fi bands',
    subscription: 'Subscription',
    subscriptionNotes: 'Subscription notes',
    indoorOutdoor: 'Use',
    powerSource: 'Power',
    batteryType: 'Battery',
    neutralWireRequired: 'Neutral wire required',
    installationNotes: 'Installation',
    regionalNotes: 'Regional notes',
  };
  const entries = Object.entries(values).filter(
    ([key, value]) =>
      labels[key] &&
      value !== undefined &&
      value !== '' &&
      !(Array.isArray(value) && value.length === 0),
  );
  if (!entries.length) return null;
  return (
    <section>
      <Heading>Good to know</Heading>
      <dl className="mt-4 divide-y divide-line border-line border-y">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3">
            <dt className="text-[14px] text-ink-3">{labels[key]}</dt>
            <dd className="font-semibold text-[14px] text-ink">
              {Array.isArray(value)
                ? value.join(', ')
                : typeof value === 'boolean'
                  ? value
                    ? 'Yes'
                    : 'No'
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  accessory: 'Accessories',
  works_with: 'Works well with',
  alternative: 'Alternatives',
  cheaper_alternative: 'Lower-priced alternatives',
  premium_alternative: 'Premium alternatives',
  required_accessory: 'Required accessories',
};

/** Only curated relationships set by staff; there is no "you may also like" filler. */
function RelatedProducts({ items }: { items: CatalogProduct['related'] }) {
  if (!items.length) return null;
  const groups = items.reduce<Record<string, CatalogProduct['related']>>((result, item) => {
    const group = result[item.relationshipType] ?? [];
    group.push(item);
    result[item.relationshipType] = group;
    return result;
  }, {});

  return (
    <section className="mt-12 border-line border-t pt-10">
      <Heading>Related products</Heading>
      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(groups).map(([type, group]) => (
          <div key={type}>
            <h3 className="font-semibold text-[13px] text-ink-3">
              {RELATIONSHIP_LABELS[type] ?? 'Related products'}
            </h3>
            <ul className="mt-3 divide-y divide-line border-line border-y">
              {group.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={storefrontProductPath(null, item.slug) as never}
                    className="block py-3 hover:text-accent"
                  >
                    <span className="font-bold text-[15px]">{item.name}</span>
                    {item.summary ? (
                      <span className="mt-0.5 block text-[13px] text-ink-3">
                        {item.summary}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
