import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { setMessage } from '@/lib/store-messages';
import { plural } from '@/lib/store-money';
import { SHOP_PATH } from '@/lib/storefront-domain';
import { getCatalogBundle } from '@/server/queries/catalog';
import { getCurrentRate } from '@/server/queries/overview';
import { getSettings } from '@/server/queries/reference';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const slug = (await params).slug;
  const bundle = await getCatalogBundle(slug);
  return bundle
    ? {
        title: bundle.name,
        description: bundle.summary ?? undefined,
        alternates: { canonical: `/setups/${slug}` },
      }
    : { title: 'Bundle not found', robots: { index: false, follow: false } };
}

export default async function SetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const bundle = await getCatalogBundle((await params).slug);
  if (!bundle) notFound();

  const [rate, settings] = await Promise.all([getCurrentRate(), getSettings()]);
  const inStock = bundle.availability > 0;

  return (
    <article className="mx-auto w-full max-w-[1320px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8 lg:pb-28">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-[13px] text-ink-3"
      >
        <Link href={SHOP_PATH as never} className="hover:text-ink hover:underline">
          Shop
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-ink">
          {bundle.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-16">
        {bundle.storefrontImageUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-tile bg-sunken lg:sticky lg:top-24 lg:self-start">
            <Image
              src={bundle.storefrontImageUrl}
              alt={bundle.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 56vw"
              className="object-cover mix-blend-multiply"
            />
          </div>
        ) : null}

        <div
          className={
            bundle.storefrontImageUrl ? 'min-w-0' : 'min-w-0 lg:col-span-2 lg:max-w-3xl'
          }
        >
          <p className="nx-label text-ink-3">Bundle</p>
          <h1 className="nx-display mt-3 text-[clamp(34px,4.6vw,60px)] text-ink">
            {bundle.name}
          </h1>
          {bundle.summary ? (
            <p className="mt-4 max-w-[52ch] text-[16px] text-ink-2 leading-relaxed">
              {bundle.summary}
            </p>
          ) : null}
          <div className="mt-8 border-line border-t pt-8">
            <StorePrice usdCents={bundle.priceCents} srdRate={rate?.rateMicros} size="xl" />
            <p className="mt-5 flex items-center gap-2 text-[14px] text-ink-2">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${inStock ? 'bg-store-bright' : 'bg-ink-4'}`}
              />
              {inStock
                ? `${plural(bundle.availability, 'bundle')} available`
                : 'Currently unavailable'}
            </p>
            <div className="mt-6">
              <WhatsAppCta
                number={settings?.whatsapp}
                tone="primary"
                label={inStock ? 'Order this bundle' : 'Ask about this bundle'}
                message={setMessage({
                  businessName: settings?.businessName ?? 'NextX',
                  setName: bundle.name,
                  inStock,
                })}
                className="h-12 px-6"
              />
            </div>
          </div>

          <section className="mt-10">
            <h2 className="nx-display text-[24px]">Included</h2>
            <ul className="mt-4 divide-y divide-line border-line border-y">
              {bundle.items.map((item, index) => (
                <li
                  key={`${item.productName}-${item.variantName}`}
                  className="flex justify-between gap-4 py-3 text-[15px]"
                >
                  <span className="flex gap-3">
                    <span aria-hidden="true" className="tabular text-ink-3">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>
                      {item.productName}
                      {item.variantName ? (
                        <span className="text-ink-3"> · {item.variantName}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tabular text-ink-3">
                    <span className="sr-only">Quantity </span>×{item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {bundle.bestFor.length ? (
            <section className="mt-10">
              <h2 className="nx-display text-[24px]">Best for</h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {bundle.bestFor.map((item) => (
                  <li
                    key={item}
                    className="border border-line px-2.5 py-1 text-[13px] text-ink"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {bundle.description ? (
            <section className="mt-10">
              <h2 className="nx-display text-[24px]">About this bundle</h2>
              <p className="mt-4 max-w-[62ch] whitespace-pre-line text-[16px] text-ink-2 leading-relaxed">
                {bundle.description}
              </p>
            </section>
          ) : null}

          {bundle.compatibilityNotes ? (
            <p className="mt-8 text-[14px] text-ink-2">
              <strong className="text-ink">Compatibility.</strong> {bundle.compatibilityNotes}
            </p>
          ) : null}
          {bundle.nextlyTake ? (
            <p className="mt-6 border-store-bright border-l-2 pl-5 text-[15px] text-ink-2">
              <strong className="text-ink">Our take.</strong> {bundle.nextlyTake}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
