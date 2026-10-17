import { ArrowRight, Menu, Search, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  bySlug,
  CATEGORY_LABEL,
  formatSrd,
  HERO_DESCRIPTION,
  HERO_FACTS,
  HERO_PICKUP,
  HERO_PRODUCT,
  inStock,
  PRODUCTS,
  type PreviewCategory,
  type PreviewProduct,
  stockLabel,
} from './catalog';

/**
 * CONCEPT A: "Het Magazine". Editorial technology retail.
 *
 * The real photographs are white-background cut-outs, so the concept lets the product float on a
 * colour-blocked field (multiplied, so the white disappears) and sets the type like a magazine:
 * a high-contrast serif at very large sizes, small caps for labels, hairline rules, and a printed
 * price list instead of a wall of identical cards.
 */

const PAPER = '#faf8f4';
const INK = '#17120e';
const ORANGE = '#e8590c';
const TINT: Record<PreviewCategory, string> = {
  iem: '#ece4d8',
  accessories: '#e2e8e1',
  wireless: '#e7e3ef',
};

const serif = 'font-[family-name:var(--font-pv-serif)]';
const label = 'text-[11px] font-medium uppercase tracking-[0.16em]';

function Cutout({
  product,
  className = '',
  sizes = '(max-width: 768px) 80vw, 40vw',
  priority = false,
}: {
  product: PreviewProduct;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: TINT[product.category] }}
    >
      <Image
        src={product.image}
        alt={product.name}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-contain p-[9%] mix-blend-multiply ${inStock(product) ? '' : 'opacity-50'}`}
      />
    </div>
  );
}

export function AHeader() {
  return (
    <header style={{ background: PAPER, color: INK }}>
      <p className={`${label} bg-[#17120e] py-2 text-center text-[#faf8f4]`}>
        Prijzen in SRD · Bestellen via WhatsApp
      </p>
      <div className="mx-auto grid h-16 max-w-[1320px] grid-cols-[1fr_auto_1fr] items-center px-4 lg:h-20 lg:px-8">
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium [&::-webkit-details-marker]:hidden">
            <Menu className="size-5" />
            <span className="hidden sm:inline">Menu</span>
          </summary>
          <nav className="absolute top-full left-0 z-20 mt-3 w-64 border border-[#17120e] bg-[#faf8f4] p-2 shadow-[6px_6px_0_#17120e]">
            {['Alle producten', 'In-ear monitors', 'Accessoires', 'Draadloze oordopjes'].map(
              (item) => (
                <Link
                  key={item}
                  href={'/preview/a' as never}
                  className={`${serif} block px-3 py-2 text-[26px] leading-tight hover:italic`}
                >
                  {item}
                </Link>
              ),
            )}
          </nav>
        </details>
        <Link href={'/preview/a' as never} aria-label="NextX">
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-11 w-auto lg:h-14"
          />
        </Link>
        <div className="flex items-center justify-end gap-4 text-[13px] font-medium">
          <button type="button" aria-label="Zoeken" className="flex items-center gap-2">
            <Search className="size-5" />
            <span className="hidden lg:inline">Zoeken</span>
          </button>
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-5" />
            <span className="hidden sm:inline">Mand (0)</span>
          </span>
        </div>
      </div>
      <div className="h-px bg-[#17120e]/15" />
    </header>
  );
}

export function AHome() {
  const featured = [bySlug('kz-zsn-pro-2'), bySlug('kz-zs10-pro-x'), bySlug('m-vave-sws12')];
  const grouped = (['iem', 'wireless', 'accessories'] as PreviewCategory[]).map((category) => ({
    category,
    items: PRODUCTS.filter((product) => product.category === category),
  }));

  return (
    <div
      style={{ background: PAPER, color: INK }}
      className="min-h-dvh overflow-x-clip font-sans"
    >
      <AHeader />

      {/* First screen */}
      <section className="mx-auto max-w-[1320px] px-4 pt-8 pb-12 lg:px-8 lg:pt-10 lg:pb-24">
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-0">
          <div className="relative z-10 flex flex-col justify-center lg:col-span-7 lg:col-start-1 lg:row-start-1 lg:pr-10 lg:pb-10">
            <p className={`${label} flex items-center gap-3`}>
              <span className="h-px w-10 bg-[#17120e]" />
              In de kijker
            </p>
            <h1
              className={`${serif} mt-5 text-[clamp(84px,24vw,128px)] leading-[0.86] tracking-[-0.035em] lg:text-[clamp(96px,11vw,168px)]`}
            >
              AS16
              <br />
              <span className="italic" style={{ color: ORANGE }}>
                Pro X
              </span>
            </h1>
            <p className="mt-7 max-w-[34ch] text-[17px] leading-relaxed text-[#17120e]/80 lg:text-[19px]">
              Zestien balanced-armature drivers, acht per oor. Een bedrade in-ear monitor van KZ
              voor wie detail wil horen.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
              <p className="text-[34px] font-medium tracking-[-0.02em] tabular-nums">
                {formatSrd(HERO_PRODUCT.priceSrd)}
              </p>
              <p className="text-[14px]">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ background: ORANGE }}
                />
                {stockLabel(HERO_PRODUCT)}
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-6">
              <Link
                href={'/preview/a/product' as never}
                className="inline-flex h-14 items-center gap-3 bg-[#17120e] px-8 text-[15px] font-medium text-[#faf8f4] hover:bg-[#2c241d]"
              >
                Bekijk de AS16 Pro X <ArrowRight className="size-4" />
              </Link>
              <a
                href="#selectie"
                className="text-[15px] font-medium underline underline-offset-[6px]"
              >
                Naar de selectie
              </a>
            </div>
          </div>

          <div className="relative max-lg:order-first lg:col-span-7 lg:col-start-6 lg:row-start-1 lg:mt-4">
            <Cutout
              product={HERO_PRODUCT}
              className="aspect-[5/4] lg:aspect-auto lg:h-[620px]"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
            <p className={`${label} absolute bottom-4 left-4 text-[#17120e]/70`}>
              Fig. 1 · KZ AS16 Pro X
            </p>
          </div>
        </div>
      </section>

      {/* The selection */}
      <section id="selectie" className="border-t border-[#17120e]/15">
        <div className="mx-auto max-w-[1320px] px-4 py-14 lg:px-8 lg:py-24">
          <div className="flex items-end justify-between gap-6">
            <h2
              className={`${serif} text-[clamp(44px,7vw,92px)] leading-[0.95] tracking-[-0.02em]`}
            >
              De <span className="italic">selectie</span>
            </h2>
            <p className={`${label} hidden pb-3 sm:block`}>{PRODUCTS.length} producten</p>
          </div>

          <div className="mt-10 -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:overflow-visible lg:px-0">
            {featured.map((product, index) => (
              <article
                key={product.slug}
                className={`group w-[78vw] shrink-0 snap-start sm:w-[46vw] lg:w-auto ${
                  ['lg:col-span-4 lg:mt-16', 'lg:col-span-5', 'lg:col-span-3 lg:mt-32'][index]
                }`}
              >
                <Link href={'/preview/a/product' as never}>
                  <Cutout
                    product={product}
                    className={index === 1 ? 'aspect-[4/5]' : 'aspect-square'}
                    sizes="(max-width: 1024px) 78vw, 30vw"
                  />
                  <div className="mt-4 flex items-baseline justify-between gap-4">
                    <h3 className={`${serif} text-[28px] leading-tight group-hover:italic`}>
                      {product.name}
                    </h3>
                    <p className="text-[16px] font-medium tabular-nums">
                      {formatSrd(product.priceSrd)}
                    </p>
                  </div>
                  <p className={`${label} mt-1 text-[#17120e]/60`}>
                    {CATEGORY_LABEL[product.category]} · {stockLabel(product)}
                  </p>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Printed price list: every product, one line each. */}
      <section className="bg-[#17120e] text-[#faf8f4]">
        <div className="mx-auto max-w-[1320px] px-4 py-14 lg:px-8 lg:py-24">
          <h2
            className={`${serif} text-[clamp(44px,7vw,92px)] leading-[0.95] tracking-[-0.02em]`}
          >
            Alles op{' '}
            <span className="italic" style={{ color: ORANGE }}>
              een rij
            </span>
          </h2>
          <div className="mt-12 lg:columns-2 lg:gap-x-16">
            {grouped.map(({ category, items }) => (
              <div key={category} className="mb-12 break-inside-avoid">
                <p className={`${label} border-b border-[#faf8f4]/25 pb-3 text-[#faf8f4]/60`}>
                  {CATEGORY_LABEL[category]} · {items.length}
                </p>
                <ul>
                  {items.map((product) => (
                    <li key={product.slug}>
                      <Link
                        href={'/preview/a/product' as never}
                        className="group flex items-center gap-4 border-b border-[#faf8f4]/12 py-3"
                      >
                        <span
                          className="relative size-12 shrink-0 overflow-hidden"
                          style={{ background: TINT[product.category] }}
                        >
                          <Image
                            src={product.image}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-contain p-1 mix-blend-multiply"
                          />
                        </span>
                        <span
                          className={`${serif} min-w-0 flex-1 truncate text-[22px] group-hover:italic`}
                        >
                          {product.name}
                        </span>
                        <span className={`${label} hidden text-[#faf8f4]/55 sm:block`}>
                          {stockLabel(product)}
                        </span>
                        <span className="w-24 text-right text-[16px] tabular-nums">
                          {formatSrd(product.priceSrd)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1320px] px-4 py-14 lg:px-8 lg:py-20">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p
            className={`${serif} max-w-[16ch] text-[clamp(40px,6vw,76px)] leading-[0.95] tracking-[-0.02em]`}
          >
            Vragen? <span className="italic">Stuur een bericht.</span>
          </p>
          <button
            type="button"
            className="inline-flex h-14 items-center gap-3 self-start bg-[#e8590c] px-8 text-[15px] font-medium text-[#17120e] lg:self-auto"
          >
            Via WhatsApp <ArrowRight className="size-4" />
          </button>
        </div>
        <p className={`${label} mt-14 flex flex-wrap gap-x-8 gap-y-2 text-[#17120e]/55`}>
          <span>NextX · Suriname</span>
          <span>Prijzen in SRD</span>
          <span>Medewerkers</span>
        </p>
      </footer>
    </div>
  );
}

export function AProduct() {
  const product = HERO_PRODUCT;
  return (
    <div style={{ background: PAPER, color: INK }} className="min-h-dvh font-sans">
      <AHeader />
      <article className="mx-auto max-w-[1320px] px-4 py-8 lg:px-8 lg:py-14">
        <nav className={`${label} mb-8 flex gap-3 text-[#17120e]/55`}>
          <Link href={'/preview/a' as never}>Winkel</Link>
          <span>/</span>
          <span>In-ear monitors</span>
          <span>/</span>
          <span className="text-[#17120e]">KZ AS16 Pro X</span>
        </nav>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <Cutout
              product={product}
              className="aspect-square lg:aspect-[6/5]"
              sizes="(max-width: 1024px) 100vw, 58vw"
              priority
            />
            <p className={`${label} mt-3 text-[#17120e]/55`}>Fig. 1 · KZ AS16 Pro X</p>
          </div>

          <div className="lg:col-span-5">
            <p className={`${label} text-[#17120e]/60`}>KZ · In-ear monitor</p>
            <h1
              className={`${serif} mt-3 text-[clamp(64px,9vw,112px)] leading-[0.9] tracking-[-0.03em]`}
            >
              AS16{' '}
              <span className="italic" style={{ color: ORANGE }}>
                Pro X
              </span>
            </h1>
            <div className="mt-8 flex items-baseline gap-5 border-y border-[#17120e]/20 py-5">
              <p className="text-[38px] font-medium tracking-[-0.02em] tabular-nums">
                {formatSrd(product.priceSrd)}
              </p>
              <p className="text-[14px]">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ background: ORANGE }}
                />
                {stockLabel(product)}
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="inline-flex h-14 flex-1 items-center justify-center gap-3 bg-[#17120e] px-8 text-[15px] font-medium text-[#faf8f4]"
              >
                <ShoppingBag className="size-4" /> In de mand
              </button>
              <button
                type="button"
                className="inline-flex h-14 items-center justify-center border border-[#17120e] px-6 text-[15px] font-medium"
              >
                WhatsApp
              </button>
            </div>

            <div className="mt-10 space-y-5 text-[17px] leading-[1.7] text-[#17120e]/85">
              <p className="first-letter:float-left first-letter:mr-3 first-letter:font-[family-name:var(--font-pv-serif)] first-letter:text-[84px] first-letter:leading-[0.8]">
                {HERO_DESCRIPTION[0]}
              </p>
              <p>{HERO_DESCRIPTION[1]}</p>
            </div>

            <dl className="mt-10 divide-y divide-[#17120e]/15 border-y border-[#17120e]/15">
              {HERO_FACTS.map(([term, value]) => (
                <div key={term} className="grid grid-cols-[120px_1fr] gap-4 py-3 text-[15px]">
                  <dt className={`${label} pt-0.5 text-[#17120e]/55`}>{term}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10">
              <p className={`${label} text-[#17120e]/55`}>Ophalen</p>
              <ul className="mt-3 divide-y divide-[#17120e]/15 border-y border-[#17120e]/15">
                {HERO_PICKUP.map((place) => (
                  <li key={place.place} className="flex justify-between gap-4 py-3 text-[15px]">
                    <span>{place.place}</span>
                    <span className={place.available ? '' : 'text-[#17120e]/50'}>
                      {place.available ? `${place.available} beschikbaar` : 'Geen voorraad'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ───────────────────────── Dashboard: "Het dagboek" ───────────────────────── */

const NAV_A = ['Sell', 'Products', 'Buy', 'Money', 'Reports', 'Settings'];

export function ADashboard() {
  const recent = [
    bySlug('kz-zs10-pro-x'),
    bySlug('kz-zsn-pro-2'),
    bySlug('kz-edx-pro-x'),
    bySlug('essager-aux-type-c-dac'),
  ];
  return (
    <div style={{ background: PAPER, color: INK }} className="min-h-dvh font-sans">
      <PreviewBanner />
      <header className="border-b border-[#17120e]/20">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-6 px-4 lg:px-8">
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-10 w-auto"
          />
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_A.map((item, index) => (
              <span
                key={item}
                className={`px-3 py-2 text-[14px] font-medium ${index === 0 ? 'border-b-2 border-[#e8590c]' : 'text-[#17120e]/65'}`}
              >
                {item}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[13px]">
            <span className="hidden rounded-none border border-[#17120e]/25 px-3 py-1.5 text-[#17120e]/60 sm:block">
              Jump to anything ⌘K
            </span>
            <span className="grid size-8 place-items-center bg-[#17120e] text-[11px] font-semibold text-[#faf8f4]">
              OW
            </span>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-[#17120e]/15 px-4 md:hidden">
          {NAV_A.map((item, index) => (
            <span
              key={item}
              className={`shrink-0 px-3 py-2.5 text-[14px] font-medium ${index === 0 ? 'border-b-2 border-[#e8590c]' : 'text-[#17120e]/65'}`}
            >
              {item}
            </span>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 py-10 lg:px-8 lg:py-14">
        <p className={`${label} text-[#17120e]/55`}>Saturday 17 October</p>
        <h1
          className={`${serif} mt-3 max-w-[18ch] text-[clamp(44px,6vw,84px)] leading-[0.95] tracking-[-0.025em]`}
        >
          Good morning.{' '}
          <span className="italic" style={{ color: ORANGE }}>
            Three things
          </span>{' '}
          need you.
        </h1>

        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            className="h-12 bg-[#17120e] px-6 text-[14px] font-medium text-[#faf8f4]"
          >
            Record a sale
          </button>
          {['Adjust stock', 'New order', 'Add a product'].map((action) => (
            <button
              key={action}
              type="button"
              className="h-12 border border-[#17120e] px-6 text-[14px] font-medium"
            >
              {action}
            </button>
          ))}
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <h2 className={`${label} border-b border-[#17120e] pb-3`}>Needs attention</h2>
            <ul className="divide-y divide-[#17120e]/15">
              {[
                ['2 orders waiting to be confirmed', 'Orders', 'Confirm'],
                ['KZ Carol: 1 left, below the reorder level', 'Stock', 'Reorder'],
                ['1 sale has a total that does not match its lines', 'Money', 'Review'],
              ].map(([text, area, cta]) => (
                <li key={text} className="flex items-center justify-between gap-4 py-5">
                  <div>
                    <p className="text-[17px]">{text}</p>
                    <p className={`${label} mt-1 text-[#17120e]/50`}>{area}</p>
                  </div>
                  <span className="text-[14px] font-medium underline underline-offset-4">
                    {cta}
                  </span>
                </li>
              ))}
            </ul>

            <h2 className={`${label} mt-14 border-b border-[#17120e] pb-3`}>Recent orders</h2>
            <ul className="divide-y divide-[#17120e]/15">
              {recent.map((product, index) => (
                <li
                  key={product.slug}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"
                >
                  <span
                    className="relative size-12 overflow-hidden"
                    style={{ background: TINT[product.category] }}
                  >
                    <Image
                      src={product.image}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-contain p-1 mix-blend-multiply"
                    />
                  </span>
                  <div>
                    <p className="text-[16px]">{product.name}</p>
                    <p className={`${label} text-[#17120e]/50`}>
                      #{1042 - index} ·{' '}
                      {['Confirmed', 'Awaiting payment', 'Ready to collect', 'Paid'][index]}
                    </p>
                  </div>
                  <p className="text-[16px] tabular-nums">{formatSrd(product.priceSrd)}</p>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-10 lg:col-span-5">
            <section>
              <h2 className={`${label} border-b border-[#17120e] pb-3`}>Today, in SRD</h2>
              <p className={`${serif} mt-4 text-[72px] leading-none tabular-nums`}>SRD 4.350</p>
              <p className="mt-2 text-[14px] text-[#17120e]/60">3 sales · 2 still to be paid</p>
            </section>
            <section>
              <h2 className={`${label} border-b border-[#17120e] pb-3`}>Today, in USD</h2>
              <p className={`${serif} mt-4 text-[72px] leading-none tabular-nums`}>$ 0</p>
              <p className="mt-2 text-[14px] text-[#17120e]/60">
                No USD sales. Never added to SRD.
              </p>
            </section>
            <section>
              <h2 className={`${label} border-b border-[#17120e] pb-3`}>Running low</h2>
              <ul className="divide-y divide-[#17120e]/15">
                {[bySlug('kz-carol'), bySlug('kz-as16-pro-x'), bySlug('m-vave-sws12')].map(
                  (product) => (
                    <li key={product.slug} className="flex justify-between py-3 text-[15px]">
                      <span>{product.name}</span>
                      <span className="tabular-nums">{stockLabel(product)}</span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

export function PreviewBanner() {
  return (
    <p className="bg-[#fff3bf] px-4 py-1.5 text-center text-[11px] font-medium tracking-wide text-[#5c4a00]">
      DESIGN PREVIEW · sample figures, not the books · real product names and prices
    </p>
  );
}
