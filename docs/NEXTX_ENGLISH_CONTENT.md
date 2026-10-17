# NextX public shop: English content

Decision (owner, 2026-10-17): the whole public shop is English. The staff dashboard was already English.

## What changed

- Page language is `en-SR` (`<html lang>`), metadata, Open Graph text, the share image, error and 404 pages,
  the retired-Watches 410 page, the quote page and the two customer forms are English.
- Prices read `SRD 4,850` (comma thousands, point decimals). Dates read `Saturday, 17 October 2026`
  (`en-GB` formatting: there is no `en-SR` locale data in `Intl`). `src/lib/store-money.ts` is the one place.
- Every WhatsApp message is written in `src/lib/store-messages.ts`. Plain text, no emoji. It states what the
  site showed and asks the shop to confirm; it promises no reservation, delivery date or final price.
- Plural and label wording lives in the components; the route names are unchanged.

## Stored records that are still Dutch

The database rows are untouched. `src/lib/english-content.ts` swaps a *known* legacy Dutch record for reviewed
English at display time, by exact match. When the owner edits a record, the edit shows as typed and the entry
stops applying. The entries can be deleted once the records are edited.

| Where | Stored (Dutch) | Shown |
|---|---|---|
| Settings → pickup label | Alleen ophalen | Pickup only |
| Settings → pickup details | Beschikbaar voor ophalen in de winkel. | Available for pickup in store. |
| Settings / storefront description | In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD. | In-ear monitors and accessories. Order via WhatsApp; prices in SRD. |
| Product names | "…Aux Verlengkabel" (2), "KZ IEM 3.5mm Kabel" | "…Aux Extension Cable", "KZ IEM 3.5mm Cable" |
| KZ AS16 Pro X description (2 paragraphs) | Dutch | English translation, same facts |
| KZ AS16 Pro X specifications | Type, Kabel, Drivers values in Dutch | Same specifications in English |

**Owner action (recommended):** edit these in the dashboard so the English becomes the record. Product names:
Products → the product → storefront title override (the original name is kept). The rest: Settings and the
product description. Nothing was invented: each English line translates what the record already said.

## Staying English

- `tests/unit/storefront-english.test.ts` scans the source of every storefront file for Dutch and fails the
  build when one appears. `tests/unit/store-messages.test.ts` asserts the real WhatsApp text, including that it
  survives URL encoding with special characters.
- `tests/e2e/store-local.spec.ts` ("English throughout") renders every public page of the real catalogue and
  fails on any Dutch word, wrong `lang`, or Dutch metadata.
- `pnpm exec tsx --env-file=.env.local scripts/audit/storefront-language.ts` lists Dutch in the stored records
  and whether it is already shown in English. Add `--source` to scan all code. Run it against staging data after
  each import. Dutch the detector does not know is not found; the dictionary is `src/lib/language-audit.ts`.

## Limits

- The public JSON API (`/api/v1/storefront/*`) returns stored text as it is, so those fields are not translated.
- Customer-entered text (names, notes) is never changed.
- Category names ("In-Ear Monitor", "Wireless Earbuds") were already English.
