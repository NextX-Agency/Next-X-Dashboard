import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  bySlug,
  formatSrd,
  HERO_FACTS,
  HERO_PICKUP,
  HERO_PRODUCT,
  inStock,
  PRODUCTS,
  type PreviewProduct,
  stockLabel,
} from './catalog';
import { PreviewBanner } from './concept-a';

/**
 * CONCEPT B: "Spec". Industrial and technical, taken from the NextX logo: a hard rectangular frame,
 * heavy letters, circuit-board precision. The page is a specification sheet: everything lives in ruled
 * cells, data is set in mono, products sit on measured plates with registration marks, and sold-out
 * items are hatched like a struck line on a drawing. Orange appears as a status colour, not a wash.
 */

const PAGE = '#e7e5e0';
const PLATE = '#f7f6f2';
const INK = '#0c0c0b';
const ORANGE = '#f25c0a';
const cond = 'font-[family-name:var(--font-pv-condensed)]';
const mono = 'font-[family-name:var(--font-pv-mono)]';
const tag = `${mono} text-[11px] font-medium uppercase tracking-[0.08em]`;
const HATCH =
  'repeating-linear-gradient(135deg, transparent 0 7px, rgba(12,12,11,0.09) 7px 8px)';

const total = PRODUCTS.length;
const available = PRODUCTS.filter(inStock).length;
const lastFew = PRODUCTS.filter(
  (product) => product.stock !== null && product.stock > 0 && product.stock <= 2,
).length;

function Plate({
  product,
  className = '',
  marks = true,
  priority = false,
  sizes = '(max-width: 768px) 50vw, 20vw',
}: {
  product: PreviewProduct;
  className?: string;
  marks?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div
      className={`${className.includes('absolute') ? '' : 'relative'} overflow-hidden ${className}`}
      style={{ background: inStock(product) ? PLATE : `${HATCH}, ${PLATE}` }}
    >
      <Image
        src={product.image}
        alt={product.name}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-contain p-[10%] mix-blend-multiply ${inStock(product) ? '' : 'opacity-45'}`}
      />
      {marks ? (
        <>
          <span className="absolute top-2 left-2 size-2.5 border-t border-l border-[#0c0c0b]" />
          <span className="absolute top-2 right-2 size-2.5 border-t border-r border-[#0c0c0b]" />
          <span className="absolute bottom-2 left-2 size-2.5 border-b border-l border-[#0c0c0b]" />
          <span className="absolute right-2 bottom-2 size-2.5 border-r border-b border-[#0c0c0b]" />
        </>
      ) : null}
    </div>
  );
}

export function BHeader() {
  return (
    <header>
      <div className="bg-[#0c0c0b] text-[#f7f6f2]">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-4 lg:px-8">
          <Link href={'/preview/b' as never} aria-label="NextX">
            <Image
              src="/nextx-logo-dark.png"
              alt="NextX"
              width={950}
              height={380}
              className="h-10 w-auto"
            />
          </Link>
          <nav className={`${tag} hidden items-center gap-1 md:flex`}>
            {['01 Alles', '02 IEM', '03 Accessoires', '04 Draadloos'].map((item, index) => (
              <Link
                key={item}
                href={'/preview/b' as never}
                className={`px-3 py-2 ${index === 0 ? 'bg-[#f25c0a] text-[#0c0c0b]' : 'text-[#f7f6f2]/70 hover:text-[#f7f6f2]'}`}
              >
                {item}
              </Link>
            ))}
          </nav>
          <div className={`${tag} ml-auto flex items-center gap-4`}>
            <span className="hidden border border-[#f7f6f2]/30 px-3 py-1.5 text-[#f7f6f2]/60 sm:block">
              Zoek [ / ]
            </span>
            <span>Mand 0</span>
          </div>
        </div>
        <nav
          className={`${tag} flex gap-1 overflow-x-auto border-t border-[#f7f6f2]/15 px-4 py-2 md:hidden`}
        >
          {['01 Alles', '02 IEM', '03 Accessoires', '04 Draadloos'].map((item, index) => (
            <span
              key={item}
              className={`shrink-0 px-3 py-1.5 ${index === 0 ? 'bg-[#f25c0a] text-[#0c0c0b]' : 'text-[#f7f6f2]/70'}`}
            >
              {item}
            </span>
          ))}
        </nav>
      </div>
      <div className={`${tag} border-b-2 border-[#0c0c0b]`} style={{ background: PAGE }}>
        <div className="mx-auto flex max-w-[1320px] gap-x-8 gap-y-1 overflow-x-auto px-4 py-2 whitespace-nowrap lg:px-8">
          <span>{total} producten</span>
          <span>{available} op voorraad</span>
          <span style={{ color: '#b03e00' }}>{lastFew} laatste stuks</span>
          <span>Prijzen in SRD</span>
          <span>Bestellen via WhatsApp</span>
        </div>
      </div>
    </header>
  );
}

function Cell({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`border-[#0c0c0b] ${className}`}>{children}</div>;
}

export function BHome() {
  const product = HERO_PRODUCT;
  return (
    <div style={{ background: PAGE, color: INK }} className="min-h-dvh font-sans">
      <BHeader />

      <section className="mx-auto max-w-[1320px] px-4 pt-6 lg:px-8 lg:pt-8">
        <div
          className="grid border-2 border-[#0c0c0b] lg:grid-cols-12"
          style={{ background: PLATE }}
        >
          {/* Type cell */}
          <Cell className="relative overflow-hidden border-b-2 lg:col-span-7 lg:row-start-1 lg:border-r-2">
            <div
              className={`${tag} flex justify-between border-b border-[#0c0c0b] px-4 py-2.5`}
            >
              <span>N° 01 · In-ear monitor</span>
              <span>KZ</span>
            </div>
            <div className="px-4 pt-6 pb-6 lg:px-6 lg:pb-8">
              <h1
                className={`${cond} -ml-1 text-[clamp(84px,27vw,132px)] leading-[0.78] font-bold tracking-[-0.03em] uppercase lg:text-[clamp(100px,12.6vw,200px)]`}
              >
                AS16
                <br />
                <span style={{ color: ORANGE }}>Pro X</span>
              </h1>
              <p className={`${mono} mt-6 max-w-[40ch] text-[13px] leading-relaxed`}>
                16 balanced-armature drivers, 8 per oor. Afneembare verzilverde kabel,
                0,75&nbsp;mm 2-pin.
              </p>
            </div>
          </Cell>

          {/* Plate */}
          <Cell className="border-b-2 lg:col-span-5 lg:row-span-2 lg:row-start-1 lg:col-start-8 lg:border-b-0">
            <div className="relative aspect-[5/4] lg:h-full lg:min-h-[560px] lg:aspect-auto">
              <Plate
                product={product}
                className="absolute inset-0"
                priority
                sizes="(max-width: 1024px) 100vw, 40vw"
              />
              {[
                { n: '1', x: '76%', y: '34%', text: '16 BA · 8 per oor' },
                { n: '2', x: '52%', y: '21%', text: '2-pin 0,75 mm' },
              ].map((dot) => (
                <span
                  key={dot.n}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2"
                  style={{ left: dot.x, top: dot.y }}
                >
                  <span
                    className={`${mono} grid size-6 place-items-center rounded-full bg-[#f25c0a] text-[11px] font-semibold text-[#0c0c0b]`}
                  >
                    {dot.n}
                  </span>
                </span>
              ))}
              <ol className={`${tag} absolute bottom-3 left-3 space-y-1 bg-[#f7f6f2]/90 p-2`}>
                <li>1 — 16 BA · 8 per oor</li>
                <li>2 — 2-pin 0,75 mm</li>
              </ol>
            </div>
          </Cell>

          {/* Data cells */}
          <div className="grid grid-cols-2 lg:col-span-7 lg:row-start-2 lg:grid-cols-[1.2fr_1fr_1fr]">
            <Cell className="col-span-2 border-b-2 border-[#0c0c0b] p-4 lg:col-span-1 lg:border-r-2 lg:border-b-0 lg:p-5">
              <p className={tag}>Prijs</p>
              <p
                className={`${mono} mt-2 text-[34px] font-semibold tracking-[-0.03em] tabular-nums lg:text-[40px]`}
              >
                {formatSrd(product.priceSrd)}
              </p>
            </Cell>
            <Cell className="border-r-2 border-b-0 p-4 lg:p-5">
              <p className={tag}>Voorraad</p>
              <p
                className={`${mono} mt-2 inline-block bg-[#f25c0a] px-2 py-1 text-[20px] font-semibold uppercase`}
              >
                {stockLabel(product)}
              </p>
            </Cell>
            <Link
              href={'/preview/b/product' as never}
              className={`${cond} flex items-center justify-between bg-[#0c0c0b] p-4 text-[22px] font-bold tracking-wide text-[#f7f6f2] uppercase hover:bg-[#f25c0a] hover:text-[#0c0c0b] lg:p-5`}
            >
              Bekijk <ArrowRight className="size-6" />
            </Link>
          </div>
        </div>
      </section>

      {/* Index */}
      <section className="mx-auto max-w-[1320px] px-4 py-12 lg:px-8 lg:py-20">
        <div className="flex items-end justify-between border-b-2 border-[#0c0c0b] pb-3">
          <h2
            className={`${cond} text-[clamp(36px,6vw,72px)] leading-none font-bold tracking-[-0.02em] uppercase`}
          >
            Index
          </h2>
          <p className={tag}>{total} items</p>
        </div>
        <ul className="grid grid-cols-2 border-[#0c0c0b] md:grid-cols-3 lg:grid-cols-5">
          {PRODUCTS.map((item, index) => (
            <li
              key={item.slug}
              className="border-r border-b border-[#0c0c0b] [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r md:[&:nth-child(3n)]:border-r-0 lg:[&:nth-child(3n)]:border-r lg:[&:nth-child(5n)]:border-r-0"
            >
              <Link
                href={'/preview/b/product' as never}
                className="group block h-full bg-transparent hover:bg-[#0c0c0b] hover:text-[#f7f6f2]"
              >
                <div className={`${tag} flex justify-between px-3 py-2`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span className="opacity-60">
                    {item.category === 'iem'
                      ? 'IEM'
                      : item.category === 'wireless'
                        ? 'TWS'
                        : 'ACC'}
                  </span>
                </div>
                <Plate
                  product={item}
                  marks={false}
                  className="aspect-square group-hover:opacity-95"
                />
                <div className="px-3 pt-3 pb-3">
                  <h3
                    className={`${cond} min-h-[2.4em] text-[17px] leading-tight font-semibold uppercase`}
                  >
                    {item.name}
                  </h3>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <p className={`${mono} text-[15px] font-semibold tabular-nums`}>
                      {formatSrd(item.priceSrd)}
                    </p>
                    <p
                      className={`${tag} px-1.5 py-0.5 ${
                        item.stock === 0
                          ? 'border border-current line-through opacity-70'
                          : item.stock !== null
                            ? 'bg-[#f25c0a] text-[#0c0c0b]'
                            : 'opacity-70'
                      }`}
                    >
                      {stockLabel(item)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-[#0c0c0b] text-[#f7f6f2]">
        <div className="mx-auto grid max-w-[1320px] gap-px px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8 lg:py-16">
          {[
            ['01', 'Kies', 'Zet het product in je mand.'],
            ['02', 'Verstuur', 'Stuur je mand via WhatsApp naar NextX.'],
            [
              '03',
              'Bevestiging',
              'NextX bevestigt prijs en voorraad. Pas dan is het definitief.',
            ],
            ['04', 'Ophalen', 'Haal je bestelling op in de winkel.'],
          ].map(([n, title, text]) => (
            <div key={n} className="border-t border-[#f7f6f2]/25 py-5 pr-6">
              <p className={`${mono} text-[13px]`} style={{ color: ORANGE }}>
                {n}
              </p>
              <p className={`${cond} mt-2 text-[28px] leading-none font-bold uppercase`}>
                {title}
              </p>
              <p className="mt-2 text-[14px] text-[#f7f6f2]/70">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function BProduct() {
  const product = HERO_PRODUCT;
  return (
    <div style={{ background: PAGE, color: INK }} className="min-h-dvh font-sans">
      <BHeader />
      <article className="mx-auto max-w-[1320px] px-4 py-6 lg:px-8 lg:py-8">
        <p className={`${tag} mb-4 flex gap-2 opacity-70`}>
          <Link href={'/preview/b' as never}>Index</Link> / IEM / AS16 Pro X
        </p>
        <div
          className="grid border-2 border-[#0c0c0b] lg:grid-cols-12"
          style={{ background: PLATE }}
        >
          <div className="relative border-b-2 border-[#0c0c0b] lg:col-span-7 lg:border-r-2 lg:border-b-0">
            <div className="relative aspect-square lg:aspect-[6/5]">
              <Plate
                product={product}
                className="absolute inset-0"
                priority
                sizes="(max-width: 1024px) 100vw, 56vw"
              />
              {/* Measure ticks along two edges */}
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-3 opacity-60"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, #0c0c0b 0 1px, transparent 1px 16px)',
                }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-3 opacity-60"
                style={{
                  background:
                    'repeating-linear-gradient(180deg, #0c0c0b 0 1px, transparent 1px 16px)',
                }}
              />
            </div>
          </div>

          <div className="lg:col-span-5">
            <div
              className={`${tag} flex justify-between border-b border-[#0c0c0b] px-5 py-2.5`}
            >
              <span>N° 01 · KZ</span>
              <span>In-ear monitor</span>
            </div>
            <div className="px-5 pt-6 pb-5">
              <h1
                className={`${cond} text-[clamp(56px,8vw,96px)] leading-[0.85] font-bold tracking-[-0.025em] uppercase`}
              >
                AS16
                <br />
                <span style={{ color: ORANGE }}>Pro X</span>
              </h1>
            </div>

            <dl className="border-t-2 border-[#0c0c0b]">
              {[
                ['Prijs', formatSrd(product.priceSrd)],
                ['Voorraad', stockLabel(product)],
                ...HERO_FACTS,
              ].map(([term, value]) => (
                <div
                  key={term}
                  className="grid grid-cols-[110px_1fr] border-b border-[#0c0c0b]"
                >
                  <dt className={`${tag} border-r border-[#0c0c0b] px-5 py-3`}>{term}</dt>
                  <dd
                    className={`${mono} px-4 py-3 text-[14px] ${term === 'Prijs' ? 'text-[20px] font-semibold' : ''}`}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="grid grid-cols-[auto_1fr]">
              <div className="flex items-center border-r-2 border-b-2 border-[#0c0c0b]">
                <span className="grid h-14 w-11 place-items-center text-[20px]">−</span>
                <span
                  className={`${mono} grid h-14 w-9 place-items-center text-[16px] font-semibold`}
                >
                  1
                </span>
                <span className="grid h-14 w-11 place-items-center text-[20px]">+</span>
              </div>
              <button
                type="button"
                className={`${cond} flex h-14 items-center justify-between border-b-2 border-[#0c0c0b] bg-[#f25c0a] px-5 text-[22px] font-bold uppercase`}
              >
                In de mand <ArrowRight className="size-6" />
              </button>
            </div>
            <button
              type="button"
              className={`${cond} flex h-12 w-full items-center justify-between bg-[#0c0c0b] px-5 text-[18px] font-semibold text-[#f7f6f2] uppercase`}
            >
              Bestel via WhatsApp <ArrowRight className="size-5" />
            </button>

            <p className={`${tag} border-b border-[#0c0c0b] px-5 pt-5 pb-2`}>
              Ophalen · voorraad per locatie
            </p>
            <ul>
              {HERO_PICKUP.map((place) => (
                <li
                  key={place.place}
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#0c0c0b] px-5 py-3"
                >
                  <span className="text-[14px]">{place.place}</span>
                  <span
                    className={`${tag} px-1.5 py-0.5 ${place.available ? 'bg-[#f25c0a] text-[#0c0c0b]' : 'line-through opacity-60'}`}
                  >
                    {place.available ? `${place.available} beschikbaar` : 'geen voorraad'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    </div>
  );
}

/* ───────────────────────── Dashboard: "Controlekamer" ───────────────────────── */

const RAIL_B = [
  ['Sell', 'Orders · Sales · Customers · Quotes'],
  ['Products', 'Catalogue · Bundles · Categories'],
  ['Stock', 'Inventory · Reorder · Transfers'],
  ['Buy', 'Suppliers · Purchase orders'],
  ['Money', 'Ledger · Wallets · Invoices · Expenses'],
  ['Reports', 'Reports · Owners'],
  ['Shop', 'Storefront · Price lists'],
];

export function BDashboard() {
  const lines = [
    [bySlug('kz-zs10-pro-x'), 1, 'Paid', 'SRD'],
    [bySlug('kz-zsn-pro-2'), 1, 'Awaiting payment', 'SRD'],
    [bySlug('kz-edx-pro-x'), 2, 'Confirmed', 'SRD'],
    [bySlug('essager-aux-type-c-dac'), 1, 'Paid', 'SRD'],
    [bySlug('kz-carol'), 1, 'Awaiting payment', 'SRD'],
  ] as const;
  return (
    <div style={{ background: PAGE, color: INK }} className="min-h-dvh font-sans">
      <PreviewBanner />
      <div className="grid min-h-[calc(100dvh-28px)] grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="bg-[#0c0c0b] text-[#f7f6f2] lg:sticky lg:top-0 lg:h-[calc(100dvh-28px)]">
          <div className="flex h-14 items-center border-b border-[#f7f6f2]/15 px-4">
            <Image
              src="/nextx-logo-dark.png"
              alt="NextX"
              width={950}
              height={380}
              className="h-9 w-auto"
            />
          </div>
          <nav className="flex gap-1 overflow-x-auto p-2 lg:block lg:space-y-px lg:p-0">
            {RAIL_B.map(([name, items], index) => (
              <div
                key={name}
                className={`shrink-0 px-4 py-2.5 lg:border-b lg:border-[#f7f6f2]/10 lg:py-3.5 ${index === 0 ? 'bg-[#f25c0a] text-[#0c0c0b]' : ''}`}
              >
                <p className={`${cond} text-[17px] leading-none font-bold uppercase`}>{name}</p>
                <p
                  className={`${mono} mt-1 hidden text-[10px] leading-snug lg:block ${index === 0 ? 'opacity-80' : 'opacity-50'}`}
                >
                  {items}
                </p>
              </div>
            ))}
          </nav>
        </aside>

        <main>
          <div className="flex h-14 items-center gap-3 border-b-2 border-[#0c0c0b] px-4 lg:px-6">
            <span className={`${tag} flex-1 border border-[#0c0c0b]/40 px-3 py-2 opacity-70`}>
              Jump to product, order, customer… ⌘K
            </span>
            <button
              type="button"
              className={`${cond} h-9 bg-[#f25c0a] px-4 text-[15px] font-bold uppercase`}
            >
              + Record sale
            </button>
          </div>

          <div className="space-y-px p-4 lg:p-6">
            {/* Money: SRD and USD are separate cells, never summed */}
            <div
              className="grid border-2 border-[#0c0c0b] sm:grid-cols-2 lg:grid-cols-4"
              style={{ background: PLATE }}
            >
              {[
                ['Sales today · SRD', 'SRD 4.350', '3 sales'],
                ['Sales today · USD', '$ 0', 'none'],
                ['To collect · SRD', 'SRD 1.750', '2 orders'],
                ['Cash in wallets · SRD', 'SRD 18.920', '4 wallets'],
              ].map(([name, value, note], index) => (
                <div
                  key={name}
                  className={`p-4 ${index ? 'border-t-2 sm:border-l-2 sm:border-t-0' : ''} border-[#0c0c0b] ${index === 2 ? 'sm:border-t-2 lg:border-t-0' : ''}`}
                >
                  <p className={tag}>{name}</p>
                  <p
                    className={`${mono} mt-3 text-[28px] font-semibold tracking-[-0.03em] tabular-nums`}
                  >
                    {value}
                  </p>
                  <p className={`${tag} mt-1 opacity-60`}>{note}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-px lg:grid-cols-[1.6fr_1fr]">
              <section className="border-2 border-[#0c0c0b]" style={{ background: PLATE }}>
                <div
                  className={`${tag} flex justify-between border-b-2 border-[#0c0c0b] px-4 py-2.5`}
                >
                  <span>Orders</span>
                  <span>5 open</span>
                </div>
                <table className="w-full text-left">
                  <thead className={`${tag} border-b border-[#0c0c0b] opacity-60`}>
                    <tr>
                      <th className="px-4 py-2 font-medium">No.</th>
                      <th className="px-2 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 text-right font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(([product, qty, status], index) => (
                      <tr
                        key={product.slug}
                        className="border-b border-[#0c0c0b]/30 text-[14px]"
                      >
                        <td className={`${mono} px-4 py-3`}>#{1042 - index}</td>
                        <td className="px-2 py-3">{product.name}</td>
                        <td className={`${mono} px-2 py-3 text-right tabular-nums`}>{qty}</td>
                        <td className="px-2 py-3">
                          <span
                            className={`${tag} px-1.5 py-0.5 ${status === 'Awaiting payment' ? 'bg-[#f25c0a] text-[#0c0c0b]' : 'border border-[#0c0c0b]/50'}`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className={`${mono} px-4 py-3 text-right tabular-nums`}>
                          {formatSrd(product.priceSrd * qty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="border-2 border-[#0c0c0b]" style={{ background: PLATE }}>
                <div className={`${tag} border-b-2 border-[#0c0c0b] px-4 py-2.5`}>
                  Stock alerts
                </div>
                <ul>
                  {PRODUCTS.filter(
                    (p) => p.stock === 0 || (p.stock !== null && p.stock <= 2),
                  ).map((p) => (
                    <li
                      key={p.slug}
                      className="flex items-center justify-between gap-3 border-b border-[#0c0c0b]/30 px-4 py-3 text-[14px]"
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span
                        className={`${tag} shrink-0 px-1.5 py-0.5 ${p.stock === 0 ? 'line-through opacity-60' : 'bg-[#f25c0a] text-[#0c0c0b]'}`}
                      >
                        {stockLabel(p)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
