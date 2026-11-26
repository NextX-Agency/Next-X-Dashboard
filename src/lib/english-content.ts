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

/**
 * The shop's own one-line description. What NextX sells, how an order works, which currency. Shown when
 * the owner has not written a description, and in place of the legacy imported one-liner below.
 */
export const STORE_DESCRIPTION_TEXT =
  'In-ear monitors, wireless earbuds and accessories in Paramaribo. Build a cart, send it on WhatsApp, and NextX confirms price and stock. Prices in SRD.';

/** Whitespace-insensitive comparison key. */
function key(value: string): string {
  // U+FFFC (a pasted inline image in the legacy copy) is dropped on display, so it is ignored here too.
  return value
    .replace(/\uFFFC/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const LEGACY_TEXT: ReadonlyMap<string, string> = new Map(
  (
    [
      // Settings written by the import.
      ['Alleen ophalen', 'Pickup only'],
      ['Beschikbaar voor ophalen in de winkel.', 'Available for pickup in store.'],
      [
        'In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD.',
        STORE_DESCRIPTION_TEXT,
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
      // Product and bundle descriptions from the import, one entry per paragraph.
      // Product KZ ZSN Pro 2.
      [
        'De KZ ZSN Pro 2 is een bedrade hybrid in-ear monitor met een combinatie van een 10 mm super-linear dynamische driver en een balanced armature driver voor een rijk, gedetailleerd en dynamisch geluid. Door deze hybride technologie krijg je krachtige bas, heldere hoge tonen en een goed uitgebalanceerde geluidsweergave voor muziek, video of games.',
        'The KZ ZSN Pro 2 is a wired hybrid in-ear monitor that pairs a 10 mm super-linear dynamic driver with a balanced armature driver for rich, detailed and dynamic sound. This hybrid setup gives you powerful bass, clear highs and well-balanced sound for music, video or games.',
      ],
      [
        'De oordopjes hebben een afneembare 0,75 mm 2-pin kabel die je eenvoudig kunt vervangen of upgraden, en een ergonomisch ontwerp voor comfortabel dragen.',
        'The earphones have a detachable 0.75 mm 2-pin cable that you can easily replace or upgrade, and an ergonomic design for comfortable wear.',
      ],
      [
        'Samengevat is de KZ ZSN Pro 2 een betaalbare keuze voor wie duidelijker, rijker en meer gedetailleerd geluid wil dan standaard oordopjes, met goede bouwkwaliteit en veelzijdige prestaties voor dagelijks gebruik.',
        'In short, the KZ ZSN Pro 2 is an affordable choice for anyone who wants clearer, richer and more detailed sound than standard earbuds, with good build quality and versatile everyday performance.',
      ],
      // Product KZ Elliptical Pouch.
      [
        'De KZ pouch is een kleine, zachte draagtas ontworpen om je KZ-oordopjes en accessoires zoals kabels en ear tips netjes en veilig op te bergen. Hij biedt bescherming tegen krassen en vuil en past gemakkelijk in je tas of zak, zodat je je audio-apparatuur eenvoudig mee kunt nemen zonder dat alles los rondzwerft.',
        'The KZ pouch is a small, soft carrying case designed to store your KZ earphones and accessories, such as cables and ear tips, neatly and safely. It protects against scratches and dirt and fits easily in your bag or pocket, so you can take your audio gear with you without everything rattling around loose.',
      ],
      // Product KZ EDX PRO.
      [
        'De KZ EDX Pro is een bedrade in-ear monitor die sterke geluidskwaliteit biedt voor een betaalbare prijs. Dankzij de 10 mm dynamische driver levert hij diepe bas, heldere middentonen en scherpe hoge tonen, ideaal voor muziek, gaming en dagelijks gebruik.',
        'The KZ EDX Pro is a wired in-ear monitor that offers strong sound quality at an affordable price. Its 10 mm dynamic driver delivers deep bass, clear mids and crisp highs, ideal for music, gaming and everyday use.',
      ],
      [
        'De lichte en ergonomische behuizing zorgt voor comfortabel dragen, zelfs bij lange luistersessies. De afneembare 0,75 mm 2-pin kabel maakt het eenvoudig om de kabel te vervangen of te upgraden. De KZ EDX Pro is verkrijgbaar met of zonder microfoon en is een uitstekende keuze voor wie goed geluid zoekt zonder veel te betalen.',
        'The light, ergonomic housing stays comfortable, even during long listening sessions. The detachable 0.75 mm 2-pin cable makes it easy to replace or upgrade the cable. The KZ EDX Pro is available with or without a microphone and is an excellent choice for anyone who wants good sound without spending much.',
      ],
      // Product KZ Castor PRO.
      [
        'De KZ Castor Pro is een bedrade in-ear monitor die hoogwaardige geluidskwaliteit biedt met meer detail en controle. Dankzij de dual dynamic drivers levert hij krachtige bas, heldere middentonen en scherpe hoge tonen, ideaal voor muziek, gaming en kritisch luisteren.',
        'The KZ Castor Pro is a wired in-ear monitor that offers high-quality sound with more detail and control. Its dual dynamic drivers deliver powerful bass, clear mids and crisp highs, ideal for music, gaming and critical listening.',
      ],
      [
        'De ergonomische en stevige behuizing zorgt voor comfortabel gebruik tijdens lange luistersessies. Met de afneembare 0,75 mm 2-pin kabel is upgraden of vervangen eenvoudig. De KZ Castor Pro beschikt bovendien over instelbare tuning-schakelaars, waarmee je het geluid kunt aanpassen aan je persoonlijke voorkeur.',
        'The ergonomic, sturdy housing stays comfortable during long listening sessions. With the detachable 0.75 mm 2-pin cable, upgrading or replacing it is easy. The KZ Castor Pro also has adjustable tuning switches, so you can tailor the sound to your personal taste.',
      ],
      // Product ESSAGER AUX(3.5mm) to Type-C DAC.
      [
        'DAC adapter is een kabel waarmee je eenvoudig een apparaat met een 3,5 mm hoofdtelefoonaansluiting kunt verbinden met een Type-C-poort op je smartphone, tablet of laptop. Hij bevat een ingebouwde DAC (Digital-to-Analog Converter) die het digitale signaal van je apparaat omzet naar analoog geluid, wat zorgt voor helder en gedetailleerd geluid via je bedrade koptelefoon of speakers.',
        "This DAC adapter is a cable that lets you easily connect a device with a 3.5 mm headphone jack to the Type-C port on your smartphone, tablet or laptop. It has a built-in DAC (Digital-to-Analog Converter) that turns your device's digital signal into analogue sound, for clear and detailed audio through your wired headphones or speakers.",
      ],
      [
        'De adapter is plug-and-play, vereist geen extra software, en ondersteunt zowel muziek als handsfree bellen en inline bediening als je headset dit heeft. De behuizing is meestal stevig met een aluminium legering en gevlochten kabel voor duurzaamheid en een stabiel signaal.',
        'The adapter is plug-and-play, needs no extra software, and supports music as well as hands-free calls and inline controls if your headset has them. The housing is usually sturdy aluminium alloy with a braided cable for durability and a stable signal.',
      ],
      [
        'Kort gezegd is deze ESSAGER DAC-adapter ideaal als je moderne Type-C apparaten wilt gebruiken met oudere 3,5 mm audiokoptelefoons zonder standaard hoofdtelefoonaansluiting.',
        'In short, this ESSAGER DAC adapter is ideal if you want to use modern Type-C devices with older 3.5 mm headphones when there is no standard headphone jack.',
      ],
      // Product KZ IEM 3.5mm Kabel.
      [
        'Flexibel en duurzaam, deze kabel levert helder en stabiel geluid zodat je IEM’s optimaal presteren. Plug-and-play, direct te gebruiken.',
        'Flexible and durable, this cable delivers clear, stable sound so your IEMs perform at their best. Plug-and-play, ready to use.',
      ],
      // Product KZ ZS10 PRO X.
      [
        'De KZ ZS10 Pro X combineert krachtige bass, heldere mid-tonen en gedetailleerde hoge tonen dankzij de geavanceerde driver-opstelling, wat resulteert in rijk en meeslepend geluid dat je normaal alleen bij duurdere oordopjes hoort.',
        'The KZ ZS10 Pro X combines powerful bass, clear mids and detailed highs thanks to its advanced driver setup, for rich, immersive sound you would normally only hear from more expensive earphones.',
      ],
      // Product M-Vave SWS12 Wireless IEM System.
      [
        'Het M-Vave M12 Wireless In-Ear Monitor Systeem is een compacte, digitale draadloze audio-oplossing die speciaal is ontworpen voor muzikanten, artiesten en content creators die behoefte hebben aan betrouwbare persoonlijke monitoring zonder de beperking van kabels. Dankzij de heldere audio-overdracht met minimale ruis en een zeer lage latentie is dit systeem uitermate geschikt voor professioneel gebruik op het podium, tijdens repetities, bij studio-opnames of voor live streaming.',
        'The M-Vave M12 Wireless In-Ear Monitor System is a compact, digital wireless audio solution designed for musicians, performers and content creators who need reliable personal monitoring without being limited by cables. With clear audio transmission, minimal noise and very low latency, the system is well suited to professional use on stage, in rehearsals, for studio recording or for live streaming.',
      ],
      [
        'Door gebruik te maken van een krachtige 2.4 GHz digitale verbinding garandeert de M12 een stabiele overdracht en een professionele geluidskwaliteit binnen een lichtgewicht en draagbaar ontwerp. Het proces is uiterst eenvoudig: de zender wordt rechtstreeks aangesloten op een mengpaneel of een andere audiobron, terwijl de ontvanger discreet aan de kleding wordt bevestigd. Vanuit daar wordt het geluid direct naar de oortjes gestuurd, wat zorgt voor een ongekende bewegingsvrijheid tijdens elke performance.',
        'Using a powerful 2.4 GHz digital connection, the M12 provides stable transmission and professional sound quality in a lightweight, portable design. Setup is simple: the transmitter connects directly to a mixing desk or other audio source, while the receiver clips discreetly to your clothing. From there the sound goes straight to your earphones, giving you complete freedom of movement during every performance.',
      ],
      // Product ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel.
      [
        'ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel is ideaal om je IEM’s, koptelefoons of speakers eenvoudig te verlengen en te verbinden met elk apparaat met een 3,5 mm audiojack.',
        'The ESSAGER 1m Aux (3.5mm) to Aux Extension Cable is ideal for easily extending your IEMs, headphones or speakers and connecting them to any device with a 3.5 mm audio jack.',
      ],
      [
        'De kabel is plug-and-play, duurzaam en zorgt voor helder en stabiel geluid, zodat je IEM’s optimaal presteren.',
        'The cable is plug-and-play, durable and delivers clear, stable sound so your IEMs perform at their best.',
      ],
      // Product ESSAGER 2m Aux(3.5mm) to Aux Verlengkabel.
      [
        'ESSAGER 2m Aux(3.5mm) to Aux Verlengkabel is ideaal om je IEM’s, koptelefoons of speakers eenvoudig te verlengen en te verbinden met elk apparaat met een 3,5 mm audiojack.',
        'The ESSAGER 2m Aux (3.5mm) to Aux Extension Cable is ideal for easily extending your IEMs, headphones or speakers and connecting them to any device with a 3.5 mm audio jack.',
      ],
      // Product KZ Carol.
      [
        'De KZ Carol set bevat de KZ Carol draadloze oordopjes, een compacte oplaadcase en zachte siliconen oortips in drie verschillende maten. De KZ Carol levert een rijk en gedetailleerd geluid dankzij de super-lineaire dynamische drivers, ideaal voor muziek luisteren, video’s en dagelijks gebruik. De stevige oplaadcase beschermt je oordopjes onderweg en biedt tot wel 42 uur aan totale batterijduur. Met de ingebouwde hybride actieve ruisonderdrukking (ANC) kun je storend omgevingsgeluid effectief dempen voor een heldere en ongestoorde audio-ervaring. Deze set biedt een complete en betaalbare draadloze audio-oplossing met kwaliteit, draagbaarheid en compatibiliteit.',
        'The KZ Carol set includes the KZ Carol wireless earbuds, a compact charging case and soft silicone ear tips in three sizes. The KZ Carol delivers rich, detailed sound from its super-linear dynamic drivers, ideal for music, videos and everyday use. The sturdy charging case protects your earbuds on the go and provides up to 42 hours of total battery life. Built-in hybrid active noise cancelling (ANC) effectively reduces distracting background noise for clear, undisturbed audio. This set is a complete, affordable wireless audio solution that combines quality, portability and compatibility.',
      ],
      // Product KZ AZ09.
      [
        'De KZ AZ09 set bevat de KZ AZ09 draadloze bluetooth-modules (oorkaken) en een compacte oplaadcase met grote capaciteit. De KZ AZ09 transformeert je bedrade in-ear monitors moeiteloos in high-definition draadloze oortjes, ideaal voor muziek luisteren, video’s en dagelijks gebruik. De stevige oplaadcase beschermt je modules onderweg en houdt ze netjes georganiseerd terwijl ze automatisch worden opgeladen. Met de ingebouwde Bluetooth 5.2-chip en handige touch-bediening geniet je van een stabiele verbinding en een batterijduur tot wel 6 uur per oplaadbeurt. Deze set biedt een complete en betaalbare draadloze audio-oplossing met kwaliteit, draagbaarheid en compatibiliteit.',
        'The KZ AZ09 set includes the KZ AZ09 wireless Bluetooth modules (ear hooks) and a compact, high-capacity charging case. The KZ AZ09 easily turns your wired in-ear monitors into high-definition wireless earphones, ideal for music, videos and everyday use. The sturdy charging case protects your modules on the go and keeps them organised while they charge automatically. With the built-in Bluetooth 5.2 chip and handy touch controls, you get a stable connection and up to 6 hours of battery life per charge. This set is a complete, affordable wireless audio solution that combines quality, portability and compatibility.',
      ],
      // Product KZ Vader.
      [
        'De KZ Vader is een bedrade in-ear monitor met drie dynamische drivers per zijde die samen zorgen voor een rijk en gedetailleerd geluid met sterke bas, duidelijke middentonen en heldere hoge tonen, geschikt voor muziek, gamen en dagelijks gebruik.',
        'The KZ Vader is a wired in-ear monitor with three dynamic drivers per side that together deliver rich, detailed sound with strong bass, clear mids and bright highs, suited to music, gaming and everyday use.',
      ],
      [
        'De earphones hebben een 4-niveaus instelbare tuning-schakelaar waarmee je het geluid (bas, midden en hoge frequenties) kunt aanpassen aan je voorkeur. De ergonomische behuizing zit comfortabel in het oor en de zilvergeplateerde kabel draagt bij aan betere signaaloverdracht voor een schonere geluidsweergave.',
        'The earphones have a 4-level tuning switch that lets you adjust the sound (bass, mids and highs) to your taste. The ergonomic housing sits comfortably in the ear, and the silver-plated cable improves signal transfer for cleaner sound.',
      ],
      [
        'De KZ Vader heeft een afneembare 0,75 mm 2-pin kabel met 3,5 mm plug en is verkrijgbaar met of zonder microfoon. De combinatie van meerdere drivers en verstelbare tuning maakt hem een veelzijdige keuze voor wie gedetailleerd geluid wil zonder een hoge prijs.',
        'The KZ Vader has a detachable 0.75 mm 2-pin cable with a 3.5 mm plug and is available with or without a microphone. Its multiple drivers and adjustable tuning make it a versatile choice for anyone who wants detailed sound without a high price.',
      ],
      // Bundle KZ ZS10 PRO X DEAL.
      [
        'e combo met KZ ZS10 Pro X in-ear monitors, KZ pouch en ESSAGER AUX (3.5 mm) naar Type-C DAC geeft je alles wat je nodig hebt voor hoogwaardig, professioneel geluid onderweg. De KZ ZS10 Pro X levert een rijk, gedetailleerd en gebalanceerd geluid dankzij 10 hybride drivers, waardoor diepe bass, heldere mids en sprankelende highs perfect samenkomen. Dit maakt de IEM ideaal voor muziek, gaming, content creators en langdurig luisteren. De KZ pouch beschermt je oordopjes en accessoires, houdt alles netjes georganiseerd en is makkelijk mee te nemen. Met de ESSAGER DAC-adapter sluit je je 3,5 mm hoofdtelefoon moeiteloos aan op moderne apparaten met een Type-C-poort, waarbij de ingebouwde converter zorgt voor helder en stabiel analoog geluid. Deze set is ideaal voor wie een complete, betaalbare en toekomstbestendige audio-oplossing zoekt met topgeluid, bescherming en volledige compatibiliteit met Type-C apparaten.',
        'This combo with KZ ZS10 Pro X in-ear monitors, a KZ pouch and an ESSAGER AUX (3.5 mm) to Type-C DAC gives you everything you need for high-quality, professional sound on the go. The KZ ZS10 Pro X delivers rich, detailed and balanced sound from 10 hybrid drivers, bringing together deep bass, clear mids and sparkling highs. That makes this IEM ideal for music, gaming, content creators and long listening sessions. The KZ pouch protects your earphones and accessories, keeps everything organised and is easy to carry. With the ESSAGER DAC adapter you can easily connect your 3.5 mm headphones to modern devices with a Type-C port, and its built-in converter delivers clear, stable analogue sound. This set is ideal for anyone looking for a complete, affordable and future-proof audio solution with great sound, protection and full compatibility with Type-C devices.',
      ],
      // Bundle KZ AS16 PRO X Deal.
      [
        'De KZ AS16 PRO X combo bevat KZ Vader oordopjes, een KZ pouch en een ESSAGER AUX (3,5 mm) naar Type-C DAC-adapter. De KZ Vader levert rijk, gedetailleerd geluid met meerdere dynamische drivers en instelbare tuning, ideaal voor muziek en dagelijks gebruik. De KZ pouch zorgt ervoor dat je oordopjes en accessoires netjes opgeborgen en beschermd zijn, en de ESSAGER DAC-adapter maakt het mogelijk om je 3,5 mm hoofdtelefoon aan te sluiten op moderne apparaten met een Type-C-poort voor helder geluid. Deze set biedt een complete en betaalbare audio-oplossing met kwaliteit, draagbaarheid en compatibiliteit.',
        'The KZ AS16 PRO X combo includes KZ Vader earphones, a KZ pouch and an ESSAGER AUX (3.5 mm) to Type-C DAC adapter. The KZ Vader delivers rich, detailed sound with multiple dynamic drivers and adjustable tuning, ideal for music and everyday use. The KZ pouch keeps your earphones and accessories neatly stored and protected, and the ESSAGER DAC adapter lets you connect your 3.5 mm headphones to modern devices with a Type-C port for clear sound. This set is a complete, affordable audio solution that combines quality, portability and compatibility.',
      ],
      // Bundle KZ ZSN Pro 2 DEAL.
      [
        'De KZ ZSN Pro 2 combo bevat KZ ZSN Pro 2 oordopjes, een KZ pouch en een ESSAGER AUX (3,5 mm) naar Type-C DAC-adapter. De KZ ZSN Pro 2 levert rijk, gedetailleerd geluid dankzij de hybride drivers, ideaal voor muziek luisteren, video’s en dagelijks gebruik. De KZ pouch beschermt je oordopjes en accessoires en houdt ze netjes georganiseerd. Met de ESSAGER DAC-adapter kun je je 3,5 mm headphones aansluiten op moderne apparaten met een Type-C-poort met een ingebouwde converter voor helder analoog geluid. Deze set biedt een complete en betaalbare audio-oplossing met kwaliteit, draagbaarheid en compatibiliteit.',
        'The KZ ZSN Pro 2 combo includes KZ ZSN Pro 2 earphones, a KZ pouch and an ESSAGER AUX (3.5 mm) to Type-C DAC adapter. The KZ ZSN Pro 2 delivers rich, detailed sound from its hybrid drivers, ideal for music, videos and everyday use. The KZ pouch protects your earphones and accessories and keeps them organised. With the ESSAGER DAC adapter you can connect your 3.5 mm headphones to modern devices with a Type-C port, with a built-in converter for clear analogue sound. This set is a complete, affordable audio solution that combines quality, portability and compatibility.',
      ],
      // Bundle KZ Vader DEAL.
      [
        'De KZ Vader combo bevat KZ Vader oordopjes, een KZ pouch en een ESSAGER AUX (3,5 mm) naar Type-C DAC-adapter. De KZ Vader levert rijk, gedetailleerd geluid met meerdere dynamische drivers en instelbare tuning, ideaal voor muziek en dagelijks gebruik. De KZ pouch zorgt ervoor dat je oordopjes en accessoires netjes opgeborgen en beschermd zijn, en de ESSAGER DAC-adapter maakt het mogelijk om je 3,5 mm hoofdtelefoon aan te sluiten op moderne apparaten met een Type-C-poort voor helder geluid. Deze set biedt een complete en betaalbare audio-oplossing met kwaliteit, draagbaarheid en compatibiliteit.',
        'The KZ Vader combo includes KZ Vader earphones, a KZ pouch and an ESSAGER AUX (3.5 mm) to Type-C DAC adapter. The KZ Vader delivers rich, detailed sound with multiple dynamic drivers and adjustable tuning, ideal for music and everyday use. The KZ pouch keeps your earphones and accessories neatly stored and protected, and the ESSAGER DAC adapter lets you connect your 3.5 mm headphones to modern devices with a Type-C port for clear sound. This set is a complete, affordable audio solution that combines quality, portability and compatibility.',
      ],
      // Bundle KZ Castor PRO DEAL.
      [
        'De combo met KZ Castor Pro oordopjes, KZ pouch en ESSAGER AUX (3.5 mm) naar Type-C DAC geeft je alles wat je nodig hebt voor hoge-kwaliteit geluid onderweg.',
        'This combo with KZ Castor Pro earphones, a KZ pouch and an ESSAGER AUX (3.5 mm) to Type-C DAC gives you everything you need for high-quality sound on the go.',
      ],
      [
        'De KZ Castor Pro biedt rijk, gebalanceerd geluid met dual dynamic drivers, geschikt voor muziek, games en dagelijks gebruik. De KZ pouch beschermt je oordopjes en accessoires, houdt ze georganiseerd en makkelijk mee te nemen. Met de ESSAGER DAC-adapter kun je je 3,5 mm hoofdtelefoon aansluiten op moderne apparaten met een Type-C-poort, met een ingebouwde converter voor helder analoog geluid.',
        'The KZ Castor Pro offers rich, balanced sound from dual dynamic drivers, suited to music, games and everyday use. The KZ pouch protects your earphones and accessories and keeps them organised and easy to carry. With the ESSAGER DAC adapter you can connect your 3.5 mm headphones to modern devices with a Type-C port, with a built-in converter for clear analogue sound.',
      ],
      [
        'Deze set is ideaal als je een complete, betaalbare audio-oplossing wilt met goed geluid, bescherming en compatibiliteit met Type-C apparaten.',
        'This set is ideal if you want a complete, affordable audio solution with good sound, protection and compatibility with Type-C devices.',
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

/**
 * Long copy (a summary or description) with every known legacy paragraph in English. Paragraph breaks
 * are kept, so card summaries and `whitespace-pre-line` blocks read the same as before.
 */
export function publicCopy<T extends string | null | undefined>(value: T): T {
  if (typeof value !== 'string') return value;
  return value
    .split(/(?:\r?\n){2,}/)
    .map((paragraph) => publicText(paragraph.trim()))
    .join('\n\n') as T;
}

/** Paragraphs of a long description, each translated when it is a known legacy paragraph. */
export function publicParagraphs(description: string | null | undefined): string[] {
  if (!description) return [];
  return (
    description
      // CRLF as well as LF: text imported or pasted from Windows keeps its carriage returns.
      .split(/(?:\r?\n){2,}/)
      .map((paragraph) => publicText(paragraph.trim()))
      .filter(Boolean)
  );
}

/** A specification table with its labels and values in English (unknown text is kept as stored). */
export function publicSpecs(specs: Record<string, string>): [string, string][] {
  return Object.entries(specs).map(([label, value]) => [publicText(label), publicText(value)]);
}
