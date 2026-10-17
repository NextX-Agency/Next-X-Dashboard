/**
 * DESIGN-PREVIEW DATA. Local only.
 *
 * The real NextX audio catalogue as shown publicly on shop-nextx.com on 2026-10-17: the 15 product names,
 * their SRD prices, and where the live shop showed stock ("Nog n") or sold out. Photographs are the live
 * shop's own public images, downloaded with the owner's permission into `public/dev-fixtures/live/`
 * (gitignored, never committed). Anything the live shop did not state (exact stock beyond "Nog n",
 * descriptions other than the AS16 Pro X) is deliberately absent rather than invented.
 *
 * Nothing here is read by production code. Only the `/preview` routes import it.
 */

export type PreviewCategory = 'iem' | 'accessories' | 'wireless';

export type PreviewProduct = {
  slug: string;
  name: string;
  brand: string | null;
  category: PreviewCategory;
  priceSrd: number;
  /** `null`: in stock, count not shown publicly. `0`: sold out. */
  stock: number | null;
  image: string;
};

const img = (file: string) => `/dev-fixtures/live/${file}`;

export const CATEGORY_LABEL: Record<PreviewCategory, string> = {
  iem: 'In-ear monitors',
  accessories: 'Accessoires',
  wireless: 'Draadloze oordopjes',
};

export const PRODUCTS: PreviewProduct[] = [
  {
    slug: 'kz-as16-pro-x',
    name: 'KZ AS16 Pro X',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 3000,
    stock: 2,
    image: img('kz-as16-pro-x.jpg'),
  },
  {
    slug: 'kz-zs10-pro-x',
    name: 'KZ ZS10 PRO X',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 2200,
    stock: 4,
    image: img('kz-zs10-pro-x.jpg'),
  },
  {
    slug: 'kz-zsn-pro-2',
    name: 'KZ ZSN Pro 2',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 1500,
    stock: 4,
    image: img('kz-zsn-pro-2.jpg'),
  },
  {
    slug: 'kz-castor-pro',
    name: 'KZ Castor PRO',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 1500,
    stock: 0,
    image: img('kz-castor-pro.jpg'),
  },
  {
    slug: 'kz-vader',
    name: 'KZ Vader',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 1500,
    stock: 0,
    image: img('kz-vader.jpg'),
  },
  {
    slug: 'kz-edx-pro-x',
    name: 'KZ EDX Pro X',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 500,
    stock: null,
    image: img('kz-edx-pro-x.webp'),
  },
  {
    slug: 'kz-edx-pro',
    name: 'KZ EDX PRO',
    brand: 'KZ',
    category: 'iem',
    priceSrd: 500,
    stock: null,
    image: img('kz-edx-pro.jpg'),
  },
  {
    slug: 'kz-carol',
    name: 'KZ Carol',
    brand: 'KZ',
    category: 'wireless',
    priceSrd: 1400,
    stock: 1,
    image: img('kz-carol.jpg'),
  },
  {
    slug: 'm-vave-sws12',
    name: 'M-Vave SWS12 Wireless IEM System',
    brand: 'M-Vave',
    category: 'accessories',
    priceSrd: 3000,
    stock: 2,
    image: img('m-vave-sws12.jpeg'),
  },
  {
    slug: 'kz-az09',
    name: 'KZ AZ09',
    brand: 'KZ',
    category: 'accessories',
    priceSrd: 1300,
    stock: 0,
    image: img('kz-az09.jpg'),
  },
  {
    slug: 'kz-iem-3-5mm-kabel',
    name: 'KZ IEM 3.5mm Kabel',
    brand: 'KZ',
    category: 'accessories',
    priceSrd: 250,
    stock: null,
    image: img('kz-iem-cable.jpg'),
  },
  {
    slug: 'essager-2m-aux',
    name: 'ESSAGER 2m Aux (3.5mm) verlengkabel',
    brand: 'ESSAGER',
    category: 'accessories',
    priceSrd: 250,
    stock: null,
    image: img('essager-2m-aux.jpeg'),
  },
  {
    slug: 'essager-1m-aux',
    name: 'ESSAGER 1m Aux (3.5mm) verlengkabel',
    brand: 'ESSAGER',
    category: 'accessories',
    priceSrd: 250,
    stock: null,
    image: img('essager-1m-aux.jpg'),
  },
  {
    slug: 'essager-aux-type-c-dac',
    name: 'ESSAGER AUX (3.5mm) naar Type-C DAC',
    brand: 'ESSAGER',
    category: 'accessories',
    priceSrd: 200,
    stock: null,
    image: img('essager-type-c-dac.jpg'),
  },
  {
    slug: 'kz-elliptical-pouch',
    name: 'KZ Elliptical Pouch',
    brand: 'KZ',
    category: 'accessories',
    priceSrd: 200,
    stock: null,
    image: img('kz-elliptical-pouch.jpg'),
  },
];

export const bySlug = (slug: string): PreviewProduct => {
  const found = PRODUCTS.find((product) => product.slug === slug);
  if (!found) throw new Error(`preview product missing: ${slug}`);
  return found;
};

/** The one product with a real description on the live shop: used for every product-page preview. */
export const HERO_PRODUCT = bySlug('kz-as16-pro-x');

/** Real text from the live KZ AS16 Pro X page (Dutch), unedited. */
export const HERO_DESCRIPTION = [
  'De KZ AS16 Pro X is een premium bedrade in-ear monitor die professionele geluidskwaliteit levert voor de veeleisende luisteraar. Uitgerust met maar liefst 16 Balanced Armature (BA) drivers (8 per oor) biedt hij ongeëvenaarde details, een strakke bas en een breed geluidsbeeld voor de ultieme audio-ervaring.',
  'Het hoogwaardige, ergonomische ontwerp garandeert langdurig draagcomfort. Daarnaast zorgt de meegeleverde afneembare, verzilverde 0,75 mm 2-pin kabel voor een loepzuivere signaaloverdracht. Een uitstekende keuze voor audiofielen en muzikanten die streven naar compromisloze audioperfectie.',
];

/** Facts stated in that description, as label/value pairs. Nothing added. */
export const HERO_FACTS: [string, string][] = [
  ['Drivers', '16 Balanced Armature (8 per oor)'],
  ['Kabel', 'Afneembaar, verzilverd, 0,75 mm 2-pin'],
  ['Type', 'Bedrade in-ear monitor'],
];

/** Pickup stock for the hero product exactly as the live shop listed it. */
export const HERO_PICKUP: { place: string; address: string; available: number }[] = [
  { place: 'Commewijne Alkmaar', address: 'Pandit Tilakdharieweg 308', available: 1 },
  {
    place: 'Paramaribo-Noord, Blauwgrond',
    address: 'Josephine Samson Greenstraat 110',
    available: 1,
  },
  {
    place: 'Commissaris Thurkowweg 263A',
    address: 'Commissaris Thurkowweg 263A',
    available: 0,
  },
];

const srd = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
/** `SRD 3.000`: same formatting rule as the production storefront. */
export const formatSrd = (value: number): string => `SRD ${srd.format(value)}`;

export const stockLabel = (product: PreviewProduct): string =>
  product.stock === 0
    ? 'Uitverkocht'
    : product.stock === null
      ? 'Op voorraad'
      : `Nog ${product.stock}`;

export const inStock = (product: PreviewProduct): boolean => product.stock !== 0;
