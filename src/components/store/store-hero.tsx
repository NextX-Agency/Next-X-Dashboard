import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { storefrontPagePath } from '@/lib/storefront-domain';
import { getSettings } from '@/server/queries/reference';
import { getRequestStorefront } from '@/server/services/storefront';

/**
 * The catalog hero — the Fairphone opening move.
 *
 * A split hero with the newest product's photo was tried and reverted —
 * direct feedback was that a product photo up top felt out of place and the
 * two-column layout didn't read as intentional on mobile. Centered claim,
 * two actions, catalogue underneath: the wash (`store-hero-field`) carries
 * the visual interest instead of a literal photo.
 */
/** Placeholder greetings from the legacy shop ("Welkom", "Welcome To NextX") say nothing about the offer. */
const GENERIC_GREETING = /^\s*(welkom|welcome)\b/i;

export async function StoreHero() {
  const [settings, storefront] = await Promise.all([getSettings(), getRequestStorefront()]);
  const configuredTitle = storefront?.heroTitle?.trim() || settings?.heroTitle?.trim() || '';
  const heroTitle =
    configuredTitle && !GENERIC_GREETING.test(configuredTitle)
      ? configuredTitle
      : storefront?.slug === 'audio'
        ? 'Geluid dat\nklopt.'
        : 'Premium\nAudio';
  const heroBody =
    storefront?.heroSubtitle?.trim() ||
    settings?.heroBody?.trim() ||
    (storefront?.slug === 'audio'
      ? 'In-ear monitors, oordopjes en accessoires voor wie verschil hoort. Bestel via WhatsApp en haal je bestelling op na bevestiging.'
      : 'In-ear monitors, oordopjes en accessoires. Bestel via WhatsApp.');
  const storeName = storefront?.name ?? settings?.businessName ?? 'NextX';

  const catalogLabel =
    storefront?.slug === 'audio'
      ? 'Bekijk de collectie'
      : storefront?.slug === 'main' || !storefront
        ? 'Bekijk NextX'
        : `Bekijk ${storefront.slug}`;
  return (
    <section className="store-hero-field mb-10 w-full px-4 pt-16 pb-14 lg:px-6 lg:pt-20 lg:pb-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent tracking-[0.06em] uppercase">
          <span className="size-1.5 rounded-full bg-store-bright" aria-hidden="true" />
          {storefront?.slug === 'audio'
            ? 'NextX Audio · Suriname'
            : 'NextX · Paramaribo, Suriname'}
        </span>
        <h1 className="mt-5 text-[34px] font-semibold text-ink leading-[1.06] tracking-[-0.03em] sm:text-[46px] lg:text-[54px]">
          {heroTitle.split('\n').map((line, index) => (
            <span key={line}>
              {index > 0 ? (
                <>
                  <br />
                  <span className="text-accent">{line}</span>
                </>
              ) : (
                line
              )}
            </span>
          ))}
        </h1>
        <p className="mx-auto mt-4 max-w-[54ch] text-[15px] text-ink-2 leading-relaxed sm:text-[16px]">
          {heroBody}
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#catalog"
            className="inline-flex h-12 items-center rounded-full bg-accent px-7 text-[15px] font-bold text-accent-fg shadow-lg shadow-accent/25 transition-all duration-150 ease-out-instrument hover:bg-accent-hover hover:shadow-xl hover:shadow-accent/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {catalogLabel}
          </a>
          <Suspense fallback={<HeroCtaFallback />}>
            <HeroWhatsApp businessName={storeName} />
          </Suspense>
        </div>
        <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] font-medium text-ink-3">
          <li>Prijzen in SRD</li>
          {settings?.pickupEnabled ? <li>Afhalen mogelijk</li> : null}
          {settings?.whatsapp ? <li>Bestellen via WhatsApp</li> : null}
        </ul>
      </div>
    </section>
  );
}

async function HeroWhatsApp({ businessName }: { businessName: string }) {
  const settings = await getSettings();
  return (
    <WhatsAppCta
      number={settings?.whatsapp ?? null}
      message={`Hallo ${businessName}, ik heb een vraag over jullie assortiment.`}
      label="Stel een vraag via WhatsApp"
      className="h-11 rounded-full px-6 text-[14px]"
    />
  );
}

/** Same footprint as the pill above it, so streaming causes no shift. A
 *  plain browse link keeps the row honest when no WhatsApp is configured. */
function HeroCtaFallback() {
  return (
    <span className="inline-flex h-11 items-center rounded-full border border-line bg-raised px-6 text-[14px] font-medium text-ink-3">
      Stel een vraag
    </span>
  );
}

/** The value band under the grid — Fairphone's "Built to last / e-waste
 *  neutral / fair factories" triptych, translated to the three promises this
 *  shop can actually keep, as one weighted statement instead of three equal
 *  cards: the strongest promise (real stock) earns real typographic weight,
 *  the other two sit as plain supporting facts. Static: no data, no copy
 *  that can drift from the settings row. */
export async function StoreValues() {
  const settings = await getSettings();
  const supportTitle = settings?.supportTitle?.trim() || 'Hulp bij kiezen?';
  const supportBody =
    settings?.supportBody?.trim() || 'Vertel ons wat je zoekt, dan helpen we je kiezen.';
  return (
    <section id="support" className="mt-16 border-line-subtle border-t pt-12">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold text-accent tracking-[0.08em] uppercase">
            Voorraad
          </p>
          <p className="mt-3 text-[26px] font-semibold text-ink leading-[1.15] tracking-[-0.02em] sm:text-[32px]">
            De voorraad op deze site komt uit de administratie van NextX en kan snel veranderen.
            Een bestelling is pas definitief als NextX die via WhatsApp bevestigt.
          </p>
        </div>

        <dl className="grid gap-6 lg:border-l lg:border-line-subtle lg:pl-10">
          <div>
            <dt className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
              Prijzen
            </dt>
            <dd className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">
              Prijzen staan in SRD. Het USD-bedrag eronder is een indicatie op basis van de
              actuele koers.
            </dd>
          </div>
          <div className="border-line-subtle border-t pt-6">
            <dt className="text-[11px] font-medium text-ink-4 tracking-[0.08em] uppercase">
              {supportTitle}
            </dt>
            <dd className="mt-1.5 text-[14px] text-ink-2 leading-relaxed">{supportBody}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/** A concise operational sequence, not a set of invented service promises. */
export async function HowBuyingWorks() {
  const settings = await getSettings();
  const collectionStep = settings?.pickupEnabled
    ? 'Haal je bestelling op of spreek bezorging af met NextX.'
    : settings?.deliveryEnabled
      ? 'Spreek bezorging af met NextX.'
      : 'Bevestig ophalen of bezorgen met NextX.';

  return (
    <section
      id="buying"
      className="mx-auto mb-12 w-full max-w-6xl scroll-mt-20 border-line-subtle border-y px-4 py-8 lg:px-6"
    >
      <p className="text-[11px] font-semibold text-accent tracking-[0.08em] uppercase">
        Zo bestel je
      </p>
      <ol className="mt-4 grid gap-5 sm:grid-cols-4">
        {[
          ['1', 'Kies', 'Kies het product dat bij je past.'],
          [
            '2',
            'Stuur je bestelling',
            'Stuur je winkelwagen of een vraag via WhatsApp naar NextX.',
          ],
          [
            '3',
            'Bevestiging',
            'NextX bevestigt de prijs en de voorraad. Pas daarna is je bestelling definitief.',
          ],
          ['4', 'Ophalen of ontvangen', collectionStep],
        ].map(([number, title, body]) => (
          <li key={number} className="border-line-subtle border-l pl-3">
            <span className="text-[11px] font-semibold text-accent">{number}</span>
            <h2 className="mt-1 text-[13px] font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The footer's closing line, Fairphone-style: one promise on the navy
 *  field. Rendered inside the layout footer, above the legal strip. */
export function StoreFooterBanner({ storefrontSlug }: { storefrontSlug?: string | null }) {
  const isBrandEntry = !storefrontSlug || storefrontSlug === 'main';
  const catalogHref = isBrandEntry
    ? '/audio#catalog'
    : `${storefrontPagePath(storefrontSlug)}#catalog`;
  return (
    <div className="bg-store-navy">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-4 px-4 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-white p-2">
            <Image
              src="/nextx-logo-light.png"
              alt=""
              width={960}
              height={381}
              className="h-auto w-full"
            />
          </span>
          <div>
            <p className="text-[15px] font-semibold text-white tracking-[-0.01em]">
              NextX Audio
            </p>
            <p className="text-[12px] text-white/60">
              In-ear monitors, oordopjes en accessoires.
            </p>
          </div>
        </div>
        <Link
          href={catalogHref as never}
          className="inline-flex h-10 items-center rounded-full bg-store-bright px-6 text-[13px] font-bold text-store-navy shadow-lg shadow-black/20 transition-[filter] duration-150 ease-out-instrument hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {isBrandEntry ? 'Bekijk de audio-collectie' : 'Bekijk de collectie'}
        </Link>
      </div>
    </div>
  );
}
