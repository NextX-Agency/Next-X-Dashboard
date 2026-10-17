/**
 * Finds Dutch in customer-facing text. Used by the storefront-language guard test and by
 * `scripts/audit/storefront-language.ts`, which reports Dutch still sitting in catalogue and settings
 * records. It is a detector, not a translator, and it is deliberately conservative: only words that are
 * not also English, so brand names, model numbers and English copy never trip it.
 */
const DUTCH_WORDS = new Set(
  `aantal alle alles alleen bekijk bekijken beschikbaar bestel bestelt bestellen bestelling bevestig
   bevestigen bevestigt bevestiging bezorgen bezorging bij categorie categorieën controleren
   gecontroleerd daarna dat de deze die dit een geen graag haal hallo het heeft hij hun
   jij je jouw jullie kies kiezen kunnen kunt laat leeg legen maar mand meer minder momenteel
   morgen naam naar niet nieuw nieuwe nieuwste nog onder onze ons ook opmerking ophalen
   ophaallocatie prijs prijzen sluiten stuur stuurt telefoon terug toevoegen toegevoegd toon uitverkocht
   vandaag vanaf veelgestelde verstuur versturen verwijder verwijderen voor voorraad vraag vragen
   waar wat welkom werkt winkel winkelmand winkelwagen wordt worden zijn zoek zoeken zo
   gewenste datum controle beschrijving gerelateerde specificaties kenmerken garantie betalen
   bezorgd medewerkers klantervaringen artikelen artikel stuk stuks horloges collectie
   verlengkabel kabel afneembaar verzilverd bedrade bedraad draadloos draadloze oor oren geluid
   koptelefoon oordopjes lengte kleur zwart wit rood blauw groen geel grijs batterij oplaadbaar doos
   inhoud meegeleverd inclusief gebruik snoer aansluiting versie maat gewicht afmetingen materiaal
   publiek`
    .split(/\s+/)
    .filter(Boolean),
);

export function dutchWords(text: string): string[] {
  const found = new Set<string>();
  // Dutch-only letters are a strong signal on their own ("categorieën", "ongeëvenaarde").
  if (/[ëïéèüöä]/i.test(text) && /\b\p{L}*[ëï]\p{L}*\b/iu.test(text)) {
    for (const match of text.matchAll(/\b\p{L}*[ëï]\p{L}*\b/giu))
      found.add(match[0].toLowerCase());
  }
  for (const token of text.toLowerCase().split(/[^\p{L}ëï]+/u)) {
    if (token && DUTCH_WORDS.has(token)) found.add(token);
  }
  return [...found];
}
