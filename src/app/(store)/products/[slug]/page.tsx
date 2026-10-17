import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { QuoteRequestForm } from '@/components/forms/quote-request-form';
import { ProductGallery } from '@/components/store/product-gallery';
import { ProductOrderPanel } from '@/components/store/product-order-panel';
import { cardSummary } from '@/lib/public-copy';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { type CatalogProduct, getCatalogProduct } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  // Unknown slugs render the not-found page; it must never be indexed.
  if (!product)
    return { title: 'Product niet gevonden', robots: { index: false, follow: false } };

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.summary ?? undefined,
    alternates: { canonical: storefrontProductPath(null, product.slug) },
    openGraph: {
      type: 'website',
      title: product.seoTitle ?? product.name,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  };
}

// The product is read before anything is sent, not behind a Suspense boundary, so an
// unknown slug answers a real HTTP 404 instead of a streamed 200 with a not-found body.
export const instant = false;

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [product, rate, settings] = await Promise.all([
    getCatalogProduct(slug),
    getCurrentRate(),
    getSettings(),
  ]);

  // The query already filters to published, active products: a slug that is
  // not in the catalog is simply not here.
  if (!product) notFound();
  // Legacy ids and old slugs answer with one permanent hop to the canonical URL.
  if (slug !== product.slug)
    permanentRedirect(storefrontProductPath(null, product.slug) as never);

  const srdRate = rate?.rateMicros;
  const whatsapp = settings?.whatsapp ?? null;
  const paragraphs = product.description
    ? product.description
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
    : [];
  const specs = Object.entries(product.specs);
  const blurb = cardSummary(product.summary, product.name);
  const context = [product.brandName, product.categoryName].filter(Boolean).join(' · ');
  const offers = product.variants
    .filter((variant) => variant.listPriceCents > 0)
    .map((variant) => ({
      '@type': 'Offer',
      sku: variant.sku,
      name: variant.name,
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
    description: product.seoDescription ?? product.summary ?? undefined,
    image: product.images.map((image) => image.url),
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
    <article className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8 lg:pb-28">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be emitted as a script element; the serialised value escapes '<' above.
        dangerouslySetInnerHTML={{ __html: jsonLdText }}
      />

      <nav
        aria-label="Kruimelpad"
        className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-ink-3"
      >
        <Link href={SHOP_PATH as never} className="hover:text-ink hover:underline">
          Winkel
        </Link>
        {product.categoryName ? (
          <>
            <span aria-hidden="true">/</span>
            {product.categorySlug ? (
              <Link
                href={`${SHOP_PATH}?category=${product.categorySlug}` as never}
                className="hover:text-ink hover:underline"
              >
                {product.categoryName}
              </Link>
            ) : (
              <span>{product.categoryName}</span>
            )}
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-ink">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductGallery images={product.images} name={product.name} />
        </div>

        <div className="min-w-0">
          {context ? <p className="nx-label text-ink-3">{context}</p> : null}
          <h1 className="nx-display mt-3 text-[clamp(34px,4.6vw,60px)] text-ink">
            {product.name}
          </h1>
          {blurb ? (
            <p className="mt-4 max-w-[52ch] text-[16px] text-ink-2 leading-relaxed">{blurb}</p>
          ) : null}

          <div className="mt-8 border-line border-t pt-8">
            <ProductOrderPanel
              productId={product.id}
              productSlug={product.slug}
              productName={product.name}
              variants={product.variants}
              srdRate={srdRate}
              whatsapp={whatsapp}
              restockNotificationsEnabled={product.restockNotificationsEnabled}
            />
          </div>

          <GettingOrder settings={settings} warrantyMonths={product.warrantyMonths} />

          {/* The alternative channel for visitors who would rather type an enquiry than open
              WhatsApp. It files a quote request against this product; owners answer from /quotes. */}
          <details className="group mt-6 border-line border-t py-4">
            <summary className="cursor-pointer list-none text-[14px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              Of vraag een offerte aan per e-mail
            </summary>
            <div className="mt-4">
              <QuoteRequestForm productId={product.id} productName={product.name} />
            </div>
          </details>
        </div>
      </div>

      {hasDetails || specs.length > 0 ? (
        <div className="mt-16 grid gap-12 border-line border-t pt-12 lg:mt-24 lg:grid-cols-12 lg:gap-16">
          {hasDetails ? (
            <div className="space-y-10 lg:col-span-7">
              {paragraphs.length > 0 ? (
                <section>
                  <Heading>Over dit product</Heading>
                  <div className="mt-4 max-w-[62ch] space-y-4">
                    {paragraphs.map((paragraph) => (
                      <p
                        key={paragraph.slice(0, 48)}
                        className="text-[16px] text-ink-2 leading-relaxed"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </section>
              ) : null}
              {product.keyFeatures.length ? (
                <ListSection title="Belangrijkste kenmerken" values={product.keyFeatures} />
              ) : null}
              {product.nextlyTake ? (
                <section className="border-store-bright border-l-2 pl-5">
                  <Heading>Onze mening</Heading>
                  <p className="mt-3 max-w-[60ch] text-[15px] text-ink-2 leading-relaxed">
                    {product.nextlyTake}
                  </p>
                </section>
              ) : null}
              {product.boxContents.length ? (
                <ListSection title="Wat zit er in de doos" values={product.boxContents} />
              ) : null}
            </div>
          ) : null}

          <div className={`space-y-10 ${hasDetails ? 'lg:col-span-5' : 'lg:col-span-8'}`}>
            {specs.length > 0 ? (
              <section>
                <Heading>Specificaties</Heading>
                <dl className="mt-4 divide-y divide-line border-line border-y">
                  {specs.map(([name, value]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3"
                    >
                      <dt className="text-[14px] text-ink-3">{name}</dt>
                      <dd className="text-[14px] font-medium text-ink">{value}</dd>
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
        <section className="mt-16 max-w-3xl">
          <Heading>Veelgestelde vragen</Heading>
          <dl className="mt-4 divide-y divide-line border-line border-y">
            {product.faqItems.map((item) => (
              <details key={item.question} className="group py-4">
                <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.question}
                </summary>
                <p className="mt-2 max-w-[62ch] text-[15px] text-ink-2 leading-relaxed">
                  {item.answer}
                </p>
              </details>
            ))}
          </dl>
        </section>
      ) : null}

      <RelatedProducts items={product.related} />
    </article>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="nx-display text-[clamp(22px,2.4vw,30px)] text-ink">{children}</h2>;
}

function Compatibility({ product }: { product: CatalogProduct }) {
  const worksWith = [...product.compatibility.platforms, ...product.compatibility.ecosystems];
  const connection = product.compatibility.protocols;
  if (!worksWith.length && !connection.length) return null;
  return (
    <section>
      <Heading>Compatibiliteit</Heading>
      <div className="mt-4 space-y-4">
        <Chips label="Werkt met" values={worksWith} />
        <Chips label="Verbinding" values={connection} />
      </div>
    </section>
  );
}

function Chips({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div>
      <p className="nx-label text-ink-3">{label}</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <li key={value} className="border border-line px-2.5 py-1 text-[13px] text-ink">
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
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-store-bright" />
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
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
  warrantyMonths: number;
}) {
  const methods = settings?.paymentMethods ?? [];
  const rows: { label: string; body: string }[] = [];
  if (settings?.pickupEnabled) {
    rows.push({
      label: 'Ophalen',
      body: sentences([
        settings.pickupLabel,
        settings.pickupDetails,
        settings.sameDayPickupEnabled
          ? `Dezelfde dag ophalen${settings.pickupCutoffTime ? ` vóór ${settings.pickupCutoffTime}` : ''}`
          : null,
      ]),
    });
  }
  if (settings?.deliveryEnabled) {
    rows.push({
      label: 'Bezorgen',
      body: sentences([
        settings.deliveryDetails,
        settings.deliveryAreas,
        settings.deliveryFeeDisplay,
        settings.deliveryEstimateDisplay,
      ]),
    });
  }
  if (methods.length) {
    rows.push({
      label: 'Betalen',
      body: methods
        .map((method) => (method.details ? `${method.name} (${method.details})` : method.name))
        .join(' · '),
    });
  }
  if (warrantyMonths > 0) {
    rows.push({
      label: 'Garantie',
      body: `${warrantyMonths} ${warrantyMonths === 1 ? 'maand' : 'maanden'} vanaf de dag van aankoop.`,
    });
  }
  const visible = rows.filter((row) => row.body);
  if (!visible.length) return null;
  return (
    <dl className="mt-8 divide-y divide-line border-line border-y">
      {visible.map((row) => (
        <div key={row.label} className="grid grid-cols-[92px_1fr] gap-4 py-3.5">
          <dt className="nx-label pt-0.5 text-ink-3">{row.label}</dt>
          <dd className="text-[14px] text-ink-2 leading-relaxed">{row.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function Requirements({ values }: { values: Record<string, unknown> }) {
  const labels: Record<string, string> = {
    hubRequired: 'Hub nodig',
    hubName: 'Hub',
    appRequired: 'App nodig',
    appName: 'App',
    accountRequired: 'Account nodig',
    wifiRequired: 'Wi-Fi nodig',
    wifiBands: 'Wi-Fi-banden',
    subscription: 'Abonnement',
    subscriptionNotes: 'Opmerking abonnement',
    indoorOutdoor: 'Gebruik',
    powerSource: 'Voeding',
    batteryType: 'Batterij',
    neutralWireRequired: 'Nulleider nodig',
    installationNotes: 'Installatie',
    regionalNotes: 'Regionale opmerking',
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
      <Heading>Goed om te weten</Heading>
      <dl className="mt-4 divide-y divide-line border-line border-y">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-4 py-3">
            <dt className="text-[14px] text-ink-3">{labels[key]}</dt>
            <dd className="text-[14px] font-medium text-ink">
              {Array.isArray(value)
                ? value.join(', ')
                : typeof value === 'boolean'
                  ? value
                    ? 'Ja'
                    : 'Nee'
                  : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  accessory: 'Accessoires',
  works_with: 'Past goed bij',
  alternative: 'Alternatieven',
  cheaper_alternative: 'Goedkopere alternatieven',
  premium_alternative: 'Betere alternatieven',
  required_accessory: 'Benodigde accessoires',
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
    <section className="mt-16 border-line border-t pt-10">
      <Heading>Gerelateerde producten</Heading>
      <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(groups).map(([type, group]) => (
          <div key={type}>
            <h3 className="nx-label text-ink-3">
              {RELATIONSHIP_LABELS[type] ?? 'Gerelateerde producten'}
            </h3>
            <ul className="mt-3 divide-y divide-line border-line border-y">
              {group.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={storefrontProductPath(null, item.slug) as never}
                    className="block py-3 hover:text-accent"
                  >
                    <span className="text-[15px] font-semibold">{item.name}</span>
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
