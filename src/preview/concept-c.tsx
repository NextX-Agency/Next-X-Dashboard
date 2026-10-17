import {
  ClipboardList,
  Home,
  MessageCircle,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  bySlug,
  formatSrd,
  HERO_DESCRIPTION,
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
 * CONCEPT C: "Rustig". Refined, quiet commerce built for finding and buying quickly.
 *
 * No hero banner: the first screen IS the shop. A search field and category chips lead straight into
 * a clean grid; prices are the largest thing on every card; stock is a plain-language pill; the one
 * piece of merchandising is real scarcity ("Nog 1", "Nog 2"). On phones it behaves like an app, with a
 * bottom bar and a sticky buy bar on the product page.
 */

const INK = '#141414';
const MUTED = '#5c5c57';
const LINE = '#e6e6e2';
const SURFACE = '#f5f5f2';
const sans = 'font-[family-name:var(--font-pv-manrope)]';

function StockPill({ product }: { product: PreviewProduct }) {
  const out = product.stock === 0;
  const low = product.stock !== null && product.stock > 0 && product.stock <= 2;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
        out
          ? 'bg-[#efefeb] text-[#6b6b66]'
          : low
            ? 'bg-[#fff1e6] text-[#a8440a]'
            : 'bg-[#e8f4ec] text-[#1f6b3d]'
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${out ? 'bg-[#9a9a94]' : low ? 'bg-[#e8590c]' : 'bg-[#2f9e5b]'}`}
      />
      {stockLabel(product)}
    </span>
  );
}

function Card({ product, priority = false }: { product: PreviewProduct; priority?: boolean }) {
  const out = !inStock(product);
  return (
    <article
      className="group flex flex-col overflow-hidden rounded-[14px] border bg-white"
      style={{ borderColor: LINE }}
    >
      <Link href={'/preview/c/product' as never} className="block">
        <div className="relative aspect-square" style={{ background: SURFACE }}>
          <Image
            src={product.image}
            alt={product.name}
            fill
            priority={priority}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 22vw"
            className={`object-contain p-[8%] mix-blend-multiply transition-transform duration-300 group-hover:scale-[1.04] ${out ? 'opacity-45' : ''}`}
          />
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3.5 sm:p-4">
        {product.brand && !product.name.startsWith(product.brand) ? (
          <p className="text-[12px] font-medium" style={{ color: MUTED }}>
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 min-h-[2.6em] text-[15px] leading-[1.3] font-semibold">
          {product.name}
        </h3>
        <p className="mt-1 text-[22px] leading-none font-bold tracking-[-0.02em] tabular-nums">
          {formatSrd(product.priceSrd)}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <StockPill product={product} />
        </div>
        <button
          type="button"
          className={`mt-3 h-10 rounded-[10px] text-[14px] font-semibold ${
            out ? 'border text-[#141414]' : 'bg-[#141414] text-white'
          }`}
          style={out ? { borderColor: '#cfcfca' } : undefined}
        >
          {out ? 'Meld mij als hij terug is' : 'Toevoegen'}
        </button>
      </div>
    </article>
  );
}

function CHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur"
      style={{ borderColor: LINE }}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:gap-6 lg:px-8">
        <Link href={'/preview/c' as never} aria-label="NextX">
          <Image
            src="/nextx-logo-light.png"
            alt="NextX"
            width={950}
            height={380}
            className="h-10 w-auto sm:h-11"
          />
        </Link>
        <div
          className="hidden h-11 flex-1 items-center gap-3 rounded-[12px] px-4 sm:flex"
          style={{ background: SURFACE, color: MUTED }}
        >
          <Search className="size-[18px]" />
          <span className="text-[15px]">Zoek op product of merk</span>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <button
            type="button"
            aria-label="WhatsApp"
            className="hidden h-10 items-center gap-2 rounded-[10px] px-3 text-[14px] font-semibold sm:flex hover:bg-[#f5f5f2]"
          >
            <MessageCircle className="size-[18px]" /> Vragen?
          </button>
          <span className="relative grid size-10 place-items-center rounded-[10px] hover:bg-[#f5f5f2]">
            <ShoppingBag className="size-[22px]" />
            <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-[#141414] text-[10px] font-bold text-white">
              0
            </span>
          </span>
        </div>
      </div>
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-2 overflow-x-auto px-4 sm:hidden">
        <div
          className="flex h-10 flex-1 items-center gap-2 rounded-[12px] px-3.5 text-[14px]"
          style={{ background: SURFACE, color: MUTED }}
        >
          <Search className="size-4" /> Zoek op product of merk
        </div>
      </div>
    </header>
  );
}

function BottomBar({ active }: { active: 'shop' | 'cart' }) {
  const items = [
    { name: 'Winkel', icon: Home, key: 'shop' },
    { name: 'Zoeken', icon: Search, key: 'search' },
    { name: 'Mand', icon: ShoppingBag, key: 'cart' },
    { name: 'WhatsApp', icon: MessageCircle, key: 'wa' },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-white/97 pb-[env(safe-area-inset-bottom)] sm:hidden"
      style={{ borderColor: LINE }}
    >
      {items.map(({ name, icon: Icon, key }) => (
        <span
          key={key}
          className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold"
          style={{ color: key === active ? INK : MUTED }}
        >
          <Icon className="size-5" />
          {name}
        </span>
      ))}
    </nav>
  );
}

export function CHome() {
  const chips: [string, number, boolean][] = [
    ['Alles', PRODUCTS.length, true],
    ['In-ear monitors', PRODUCTS.filter((p) => p.category === 'iem').length, false],
    ['Accessoires', PRODUCTS.filter((p) => p.category === 'accessories').length, false],
    ['Draadloze oordopjes', PRODUCTS.filter((p) => p.category === 'wireless').length, false],
  ];
  const lastFew = PRODUCTS.filter((p) => p.stock !== null && p.stock > 0 && p.stock <= 2);
  return (
    <div className={`${sans} min-h-dvh bg-white pb-16 sm:pb-0`} style={{ color: INK }}>
      <CHeader />

      <main className="mx-auto max-w-[1320px] px-4 pt-4 pb-16 lg:px-8 lg:pt-6">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {chips.map(([name, count, active]) => (
            <span
              key={name}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold ${
                active ? 'bg-[#141414] text-white' : 'border bg-white'
              }`}
              style={active ? undefined : { borderColor: '#d8d8d3' }}
            >
              {name}
              <span
                className={active ? 'text-white/60' : ''}
                style={active ? undefined : { color: MUTED }}
              >
                {count}
              </span>
            </span>
          ))}
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]"
          style={{ color: MUTED }}
        >
          <p className="flex flex-wrap gap-x-5 gap-y-1">
            <span>Bestel via WhatsApp</span>
            <span>Ophalen in winkel</span>
            <span>Prijzen in SRD</span>
          </p>
          <p className="flex items-center gap-3">
            <span className="flex items-center gap-2 font-medium" style={{ color: INK }}>
              <span className="relative h-5 w-9 rounded-full bg-[#d8d8d3]">
                <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white" />
              </span>
              Alleen op voorraad
            </span>
            <span
              className="hidden h-9 items-center rounded-[10px] border px-3 font-semibold sm:flex"
              style={{ borderColor: '#d8d8d3', color: INK }}
            >
              Sorteren: Nieuwste
            </span>
          </p>
        </div>

        {lastFew.length ? (
          <section
            aria-label="Laatste stuks"
            className="mt-5 rounded-[14px] p-4"
            style={{ background: '#fff4ec' }}
          >
            <p className="text-[13px] font-bold" style={{ color: '#a8440a' }}>
              Bijna uitverkocht
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] font-medium">
              {lastFew.map((product) => (
                <li key={product.slug}>
                  {product.name}{' '}
                  <span style={{ color: '#a8440a' }}>· {stockLabel(product)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {PRODUCTS.map((product, index) => (
            <li key={product.slug}>
              <Card product={product} priority={index < 4} />
            </li>
          ))}
        </ul>
      </main>
      <BottomBar active="shop" />
    </div>
  );
}

export function CProduct() {
  const product = HERO_PRODUCT;
  return (
    <div className={`${sans} min-h-dvh bg-white pb-24 sm:pb-0`} style={{ color: INK }}>
      <CHeader />
      <main className="mx-auto max-w-[1320px] px-4 py-5 lg:px-8 lg:py-8">
        <nav className="mb-4 flex gap-2 text-[13px]" style={{ color: MUTED }}>
          <Link href={'/preview/c' as never}>Winkel</Link> / <span>In-ear monitors</span> /{' '}
          <span style={{ color: INK }}>{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <div>
            <div
              className="relative aspect-square overflow-hidden rounded-[18px] lg:aspect-[6/5]"
              style={{ background: SURFACE }}
            >
              <Image
                src={product.image}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 56vw"
                className="object-contain p-[8%] mix-blend-multiply"
              />
            </div>
          </div>

          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-[14px] font-semibold" style={{ color: MUTED }}>
              KZ · In-ear monitor
            </p>
            <h1 className="mt-1 text-[34px] leading-[1.05] font-extrabold tracking-[-0.03em] lg:text-[44px]">
              {product.name}
            </h1>
            <div className="mt-5 flex items-center gap-4">
              <p className="text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                {formatSrd(product.priceSrd)}
              </p>
              <StockPill product={product} />
            </div>

            <div className="mt-6 hidden gap-3 sm:flex">
              <div
                className="flex h-12 items-center rounded-[12px] border"
                style={{ borderColor: '#d0d0cb' }}
              >
                <span className="grid w-11 place-items-center text-[18px]">−</span>
                <span className="w-8 text-center text-[15px] font-bold">1</span>
                <span className="grid w-11 place-items-center text-[18px]">+</span>
              </div>
              <button
                type="button"
                className="h-12 flex-1 rounded-[12px] bg-[#141414] text-[15px] font-bold text-white"
              >
                In winkelwagen
              </button>
            </div>
            <button
              type="button"
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[12px] border text-[15px] font-bold"
              style={{ borderColor: '#d0d0cb' }}
            >
              <MessageCircle className="size-[18px]" /> Bestel via WhatsApp
            </button>

            <section className="mt-7 rounded-[14px] border p-4" style={{ borderColor: LINE }}>
              <h2 className="text-[14px] font-bold">Ophalen: voorraad per locatie</h2>
              <ul className="mt-3 space-y-3">
                {HERO_PICKUP.map((place) => (
                  <li
                    key={place.place}
                    className="flex items-start justify-between gap-4 text-[14px]"
                  >
                    <span>
                      <span className="block font-semibold">{place.place}</span>
                      <span className="block text-[13px]" style={{ color: MUTED }}>
                        {place.address}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${place.available ? 'bg-[#e8f4ec] text-[#1f6b3d]' : 'bg-[#efefeb] text-[#6b6b66]'}`}
                    >
                      {place.available ? `${place.available} beschikbaar` : 'Geen voorraad'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div
          className="mt-12 grid gap-10 border-t pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14"
          style={{ borderColor: LINE }}
        >
          <section>
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Beschrijving</h2>
            <div
              className="mt-4 max-w-[62ch] space-y-4 text-[16px] leading-[1.7]"
              style={{ color: '#2a2a27' }}
            >
              {HERO_DESCRIPTION.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Specificaties</h2>
            <dl className="mt-4 divide-y border-y" style={{ borderColor: LINE }}>
              {HERO_FACTS.map(([term, value]) => (
                <div
                  key={term}
                  className="grid grid-cols-[110px_1fr] gap-3 py-3 text-[15px]"
                  style={{ borderColor: LINE }}
                >
                  <dt style={{ color: MUTED }}>{term}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>

      {/* Phone: the buy action never leaves the screen */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t bg-white p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden"
        style={{ borderColor: LINE }}
      >
        <div>
          <p className="text-[20px] leading-none font-extrabold tabular-nums">
            {formatSrd(product.priceSrd)}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: '#a8440a' }}>
            {stockLabel(product)}
          </p>
        </div>
        <button
          type="button"
          className="h-12 flex-1 rounded-[12px] bg-[#141414] text-[15px] font-bold text-white"
        >
          In winkelwagen
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Dashboard: "Werkbank" ───────────────────────── */

const ACTIONS = [
  { title: 'Record a sale', sub: 'Walk-in or on account', icon: Plus, primary: true },
  { title: 'Adjust stock', sub: 'Count, receive, write off', icon: Package },
  { title: 'Orders', sub: '2 waiting to be confirmed', icon: ClipboardList },
  { title: 'Products', sub: 'Find, edit, publish', icon: ShoppingBag },
];

export function CDashboard() {
  return (
    <div
      className={`${sans} min-h-dvh pb-16 lg:pb-0`}
      style={{ background: SURFACE, color: INK }}
    >
      <PreviewBanner />
      <div className="lg:grid lg:grid-cols-[84px_1fr]">
        <aside
          className="hidden border-r bg-white lg:sticky lg:top-0 lg:block lg:h-[calc(100dvh-28px)]"
          style={{ borderColor: LINE }}
        >
          <div className="grid h-16 place-items-center border-b" style={{ borderColor: LINE }}>
            <Image
              src="/nextx-logo-light.png"
              alt="NextX"
              width={950}
              height={380}
              className="h-9 w-auto"
            />
          </div>
          <nav className="flex flex-col items-stretch gap-1 p-2">
            {[
              ['Home', Home],
              ['Sell', Plus],
              ['Stock', Package],
              ['Buy', ClipboardList],
              ['Money', Wallet],
            ].map(([name, Icon], index) => {
              const I = Icon as typeof Home;
              return (
                <span
                  key={name as string}
                  className={`flex flex-col items-center gap-1 rounded-[10px] py-2.5 text-[11px] font-semibold ${index === 0 ? 'bg-[#141414] text-white' : ''}`}
                  style={index === 0 ? undefined : { color: MUTED }}
                >
                  <I className="size-5" />
                  {name as string}
                </span>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 px-4 py-6 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-[1100px]">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-[28px] font-extrabold tracking-[-0.03em] lg:text-[36px]">
                Home
              </h1>
              <span
                className="hidden h-11 w-72 items-center gap-2 rounded-[12px] border bg-white px-3 text-[14px] sm:flex"
                style={{ borderColor: LINE, color: MUTED }}
              >
                <Search className="size-4" /> Find a product, order or customer
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {ACTIONS.map(({ title, sub, icon: Icon, primary }) => (
                <span
                  key={title}
                  className={`flex min-h-[116px] flex-col justify-between rounded-[16px] p-4 ${primary ? 'bg-[#141414] text-white' : 'border bg-white'}`}
                  style={primary ? undefined : { borderColor: LINE }}
                >
                  <Icon className="size-6" />
                  <span>
                    <span className="block text-[16px] font-bold">{title}</span>
                    <span
                      className={`block text-[12.5px] ${primary ? 'text-white/65' : ''}`}
                      style={primary ? undefined : { color: MUTED }}
                    >
                      {sub}
                    </span>
                  </span>
                </span>
              ))}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <section className="rounded-[16px] border bg-white" style={{ borderColor: LINE }}>
                <h2
                  className="border-b px-5 py-4 text-[15px] font-bold"
                  style={{ borderColor: LINE }}
                >
                  Needs your attention{' '}
                  <span className="ml-1 rounded-full bg-[#fff1e6] px-2 py-0.5 text-[12px] text-[#a8440a]">
                    3
                  </span>
                </h2>
                <ul className="divide-y" style={{ borderColor: LINE }}>
                  {[
                    ['2 orders are waiting to be confirmed', 'Confirm'],
                    ['KZ Carol is down to 1', 'Reorder'],
                    ['1 sale: total differs from its lines', 'Review'],
                  ].map(([text, cta]) => (
                    <li
                      key={text}
                      className="flex items-center justify-between gap-4 px-5 py-4 text-[15px]"
                      style={{ borderColor: LINE }}
                    >
                      {text}
                      <span
                        className="shrink-0 rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold"
                        style={{ borderColor: '#d0d0cb' }}
                      >
                        {cta}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="grid gap-4">
                <section
                  className="rounded-[16px] border bg-white p-5"
                  style={{ borderColor: LINE }}
                >
                  <p className="text-[13px] font-semibold" style={{ color: MUTED }}>
                    Sales today · SRD
                  </p>
                  <p className="mt-2 text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                    SRD 4.350
                  </p>
                  <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                    3 sales · SRD 1.750 still to collect
                  </p>
                </section>
                <section
                  className="rounded-[16px] border bg-white p-5"
                  style={{ borderColor: LINE }}
                >
                  <p className="text-[13px] font-semibold" style={{ color: MUTED }}>
                    Sales today · USD
                  </p>
                  <p className="mt-2 text-[34px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
                    $ 0
                  </p>
                  <p className="mt-2 text-[13px]" style={{ color: MUTED }}>
                    Kept separate from SRD. Never added together.
                  </p>
                </section>
              </div>
            </div>

            <section
              className="mt-4 rounded-[16px] border bg-white"
              style={{ borderColor: LINE }}
            >
              <h2
                className="border-b px-5 py-4 text-[15px] font-bold"
                style={{ borderColor: LINE }}
              >
                Recent activity
              </h2>
              <ul className="divide-y">
                {[bySlug('kz-zs10-pro-x'), bySlug('kz-zsn-pro-2'), bySlug('kz-edx-pro-x')].map(
                  (product, index) => (
                    <li
                      key={product.slug}
                      className="flex items-center gap-4 px-5 py-3.5"
                      style={{ borderColor: LINE }}
                    >
                      <span
                        className="relative size-11 shrink-0 overflow-hidden rounded-[10px]"
                        style={{ background: SURFACE }}
                      >
                        <Image
                          src={product.image}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-contain p-1 mix-blend-multiply"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">
                          {product.name}
                        </span>
                        <span className="block text-[12.5px]" style={{ color: MUTED }}>
                          Sale #{1042 - index} · {['12 min', '1 h', '3 h'][index]} ago
                        </span>
                      </span>
                      <span className="text-[15px] font-bold tabular-nums">
                        {formatSrd(product.priceSrd)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </section>
          </div>
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-white lg:hidden"
        style={{ borderColor: LINE }}
      >
        {['Home', 'Sell', 'Stock', 'Buy', 'Money'].map((name, index) => (
          <span
            key={name}
            className="flex h-14 items-center justify-center text-[12px] font-semibold"
            style={{ color: index === 0 ? INK : MUTED }}
          >
            {name}
          </span>
        ))}
      </nav>
    </div>
  );
}
