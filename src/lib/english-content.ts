/**
 * English for the public shop, without touching the stored records.
 *
 * The shop was imported from a Dutch-language site, so a few catalogue and settings records are Dutch.
 * The database rows stay exactly as they are (they are the history, and the owner edits them in the
 * dashboard). At the display boundary this module swaps a *known* legacy Dutch record for its reviewed
 * English text. Matching is exact: the moment an owner edits a record, the edited text shows as typed
 * and this table stops applying to it. Nothing here adds a claim; each line is a translation of what
 * the record already said.
 *
 * Longer-term the owner replaces these values in the dashboard (a product's storefront title override,
 * Settings, the product description) and the entries below can be deleted. `docs/NEXTX_ENGLISH_CONTENT.md`
 * lists each one.
 */

/** Whitespace-insensitive comparison key. */
function key(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const LEGACY_TEXT: ReadonlyMap<string, string> = new Map(
  (
    [
      // Settings written by the import.
      ['Alleen ophalen', 'Pickup only'],
      ['Beschikbaar voor ophalen in de winkel.', 'Available for pickup in store.'],
      [
        'In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD.',
        'In-ear monitors and accessories. Order via WhatsApp; prices in SRD.',
      ],
      // KZ AS16 Pro X specification labels and values.
      ['Kabel', 'Cable'],
      ['Bedrade in-ear monitor', 'Wired in-ear monitor'],
      ['Afneembaar, verzilverd, 0,75 mm 2-pin', 'Detachable, silver-plated, 0.75 mm 2-pin'],
      ['16 Balanced Armature (8 per oor)', '16 Balanced Armature (8 per ear)'],
      // KZ AS16 Pro X, long description (two paragraphs, translated one by one).
      [
        'De KZ AS16 Pro X is een premium bedrade in-ear monitor die professionele geluidskwaliteit levert voor de veeleisende luisteraar. Uitgerust met maar liefst 16 Balanced Armature (BA) drivers (8 per oor) biedt hij ongeëvenaarde details, een strakke bas en een breed geluidsbeeld voor de ultieme audio-ervaring.',
        'The KZ AS16 Pro X is a premium wired in-ear monitor that delivers professional sound quality for demanding listeners. Fitted with 16 Balanced Armature (BA) drivers (8 per ear), it offers exceptional detail, tight bass and a wide soundstage.',
      ],
      [
        'Het hoogwaardige, ergonomische ontwerp garandeert langdurig draagcomfort. Daarnaast zorgt de meegeleverde afneembare, verzilverde 0,75 mm 2-pin kabel voor een loepzuivere signaaloverdracht. Een uitstekende keuze voor audiofielen en muzikanten die streven naar compromisloze audioperfectie.',
        'The high-quality, ergonomic design is made for long listening sessions. The included detachable, silver-plated 0.75 mm 2-pin cable carries a clean signal. An excellent choice for audiophiles and musicians who want uncompromising sound.',
      ],
    ] as const
  ).map(([dutch, english]) => [key(dutch), english]),
);

/**
 * A generic Dutch noun inside an otherwise English product name ("… Aux Verlengkabel"). Only whole words
 * from this list are swapped; brands, model numbers and everything else in the name are left alone.
 */
const NAME_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bVerlengkabel\b/g, 'Extension Cable'],
  [/\bKabel\b/g, 'Cable'],
];

/** English display text for a stored value. Unknown text is returned untouched. */
export function publicText<T extends string | null | undefined>(value: T): T {
  if (typeof value !== 'string') return value;
  return (LEGACY_TEXT.get(key(value)) ?? value) as T;
}

/** Display name for a product: generic Dutch nouns become English, everything else stays. */
export function publicName(name: string): string {
  return NAME_WORDS.reduce(
    (result, [pattern, english]) => result.replace(pattern, english),
    name,
  );
}

/** Paragraphs of a long description, each translated when it is a known legacy paragraph. */
export function publicParagraphs(description: string | null | undefined): string[] {
  if (!description) return [];
  return description
    .split(/\n{2,}/)
    .map((paragraph) => publicText(paragraph.trim()))
    .filter(Boolean);
}

/** A specification table with its labels and values in English (unknown text is kept as stored). */
export function publicSpecs(specs: Record<string, string>): [string, string][] {
  return Object.entries(specs).map(([label, value]) => [publicText(label), publicText(value)]);
}
