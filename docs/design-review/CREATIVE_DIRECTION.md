# NextX creative direction reset: three concepts and a recommendation

Date 2026-10-17. Status: **decided and implemented.** The owner chose **C "Rustig"** and confirmed the current product photos are theirs to use, with a reshoot planned. See section 10. Sections 1 to 9 are the record of how the decision was reached.
Everything below is rendered from the running app. Previews live at `/preview`, `/preview/a|b|c`,
`/preview/<x>/product` and `/preview/<x>/dashboard`, local only (see "How the previews are isolated").
Captures are in `docs/design-review/concepts/`; start with the `compare-*` sheets.

## 1. What is wrong with the current design

Reviewed from the captures in `docs/design-review/before/` and `after/`, as a customer and as staff.

**The root cause is not CSS. It is the photography, and the design never met it.**
The live shop's 15 product photos are white-background marketplace cut-outs (mostly 640 to 1000 px, one
at 500 px, 14 to 83 KB each). The last two designs were composed against dark, atmospheric photography
(a crop of one KZ press photo). The real images were never in the review. Put on charcoal they become
white rectangles; on a warm field they only work with a multiply trick that the design did not plan for.
Judging a layout on photography it will never receive is how two rejected designs were produced.

Concrete problems in the current storefront (`after/home-1440.png`, `shop-1440.png`):

1. **One composition for everything.** Hero, four tiles, grid of identical cards, four steps, a help bar,
   a four-column footer. Each block is competent; together they are a template.
2. **Category tiles all showed the same picture** because the fixture had one photograph. With the real
   catalogue (15 products, 3 categories) they would be a different, worse problem: three tiles for 7, 7 and
   1 products, one of which holds a single item.
3. **No merchandising.** Sold-out, last-few and in-stock products look alike until you read the caption.
   The live data has genuinely useful signals ("Nog 1", "Nog 2", 3 sold out) that the design did not use.
4. **Product page ignores what is real.** The live shop knows stock per pickup location. The redesign dropped
   it for a generic "6 op voorraad".
5. **Brand is a colour, not a structure.** Orange on charcoal is a palette, not an identity. Remove the
   logo and the site could be anyone's.
6. **The hero depends on a dark photo.** The first screen only works if the featured product has a dark
   background, which none of the real products do.

Concrete problems in the current dashboard (`before/dashboard-1440.png`, `after/*-fold-1440.png`):

1. **27 navigation entries** in a 232 px rail (Finance alone has 12). Everything is equally loud.
2. **`/sales` is not in the navigation at all.** Recording or finding a sale is the most frequent job and
   it is reachable only through buttons. (Found during this review; not a design opinion.)
3. **Overview is a stack of about a dozen panels**, most of them empty states on a new install, with no clear
   "what do I do next". Primary actions (Record sale, Adjust stock) sit top right at the same weight as
   everything else.
4. **Tables are wide and flat.** Inventory scrolls horizontally at 1440; long product names wrap onto two
   lines; status badges all look alike.
5. **Redundant copy.** Every page opens with a two-line description of what the page is.
6. **Financial separation is correct but invisible.** SRD and USD are never summed, but nothing on the
   overview says so.
7. The re-skin I did earlier changed the palette and the rail colour. It did not change the structure,
   so it is a warm version of the same admin template.

## 2. Content the concepts are built on

With your permission I downloaded the 15 public product photos from the shop's own image host
(784 KB in total; gitignored, local only, nothing committed). All product names, SRD prices and
stock states below are what the live shop showed on 2026-10-17. I did not invent or alter any.

| Fact | Source |
|---|---|
| 15 products, SRD 200 to SRD 3.000 | live `/audio` |
| In stock: 12. "Nog 1/2/4": KZ Carol 1, AS16 Pro X 2, M-Vave SWS12 2, ZS10 Pro X 4, ZSN Pro 2 4. Sold out: AZ09, Vader, Castor PRO | live `/audio` |
| Counts for items shown only as "in stock" are **not** shown anywhere | not published |
| Only the KZ AS16 Pro X has a description (used unedited, Dutch) and per-location pickup stock | live product page |
| Pickup locations: Commewijne Alkmaar, Paramaribo-Noord Blauwgrond, Commissaris Thurkowweg 263A | live product page |

**Photography limits you should know about**

- The photo filenames point to third-party sources (an Amazon image id, Headphone Zone, a Mercado Libre
  style id). If those are other sellers' product photos, using them commercially needs the rights holder's
  permission or replacement. I cannot tell from the files; please confirm.
- The largest image is 1500 px, most are 700 to 1000 px, KZ Vader is 500 px (14 KB). Nothing here supports
  a hero larger than about 650 CSS px without softness, and nothing is sharp on a retina display.
- There is one photo per product, so there are no galleries and no lifestyle or detail shots.
- **The designs below are not production-ready until real photography exists**, ideally your own
  consistent shots on one background. That single investment would improve any concept more than any layout change.

## 3. The three concepts

All three use the real catalogue and the real logo. They share no hero structure, card, header or footer.

### A. "Het Magazine": editorial technology retail

*Light paper, a high-contrast serif at very large sizes, small caps, hairline rules, colour-blocked fields.*

- **First screen:** one product named like a magazine cover ("AS16 *Pro X*", the italic in orange), the
  cut-out floating on a sand field that overlaps the headline.
- **Catalogue:** three staggered features, then "Alles op een rij": a typeset price list, one line per
  product with a thumbnail, dotted rhythm, stock and price, on a dark band.
- **Card:** borderless tinted square (a different tint per category), serif name, small-caps meta.
- **Product page:** large field, serif title, big drop cap on the real description, spec rows, real pickup stock.
- **Mobile:** product image first, then title, price and CTA; features become a swipeable row.
- **Dashboard ("Het dagboek"):** top navigation with 6 groups instead of a rail; a headline sentence
  ("Three things need you"); four actions; a needs-attention list; SRD and USD in separate large figures.

### B. "Spec": industrial and technical

*Taken from the logo's hard rectangular frame and heavy letters. A specification sheet: ruled cells,
mono data, condensed capitals, registration marks, orange as a status colour.*

- **First screen:** a framed cell grid. Giant "AS16 / PRO X", the product on a plate with corner marks and
  two numbered callouts (taken from the real description: 16 BA drivers, 2-pin), then three data cells:
  price, stock (orange block), a black "Bekijk" cell.
- **Catalogue:** an "Index" of 15 numbered cells. Sold-out items are hatched and struck through, last items
  carry an orange "Nog n" tag. Header shows live counts: 15 products, 12 in stock, 3 last pieces.
- **Card:** numbered ruled cell with category code, plate, condensed name, mono price, stock tag; hover inverts.
- **Product page:** the same sheet: data table (price, stock, drivers, cable, type), order block, pickup table.
- **Mobile:** the cell grid stacks; top bar is a scrolling category strip.
- **Dashboard ("Controlekamer"):** a charcoal rail whose 7 groups each list their pages beneath;
  four ruled money cells (SRD sales, USD sales, to collect, cash) and dense orders and stock-alert tables.

### C. "Rustig": refined modern commerce

*White, quiet, fast. No hero banner: the first screen is the shop.*

- **First screen:** wide search, category chips with counts, an "only in stock" toggle, a "Bijna
  uitverkocht" strip using the real scarcity, then the grid.
- **Card:** white card, product on a soft field, brand, name, **price as the largest thing**, plain-language
  stock pill, one button ("Toevoegen", or "Meld mij als hij terug is" when sold out).
- **Product page:** image, price and stock, quantity and add, WhatsApp, and a pickup card showing stock per
  real location with addresses. Description and specifications underneath.
- **Mobile:** behaves like an app: bottom tab bar, search under the logo, **sticky buy bar** on the product page.
- **Dashboard ("Werkbank"):** a 5-item icon rail (bottom tabs on phones); four large action tiles; a
  needs-attention queue with one button per item; SRD and USD cards side by side, labelled as never added.

## 4. Evaluation against your criteria

Scores are my judgement from the renders: **strong / adequate / weak**.

| Criterion | A Magazine | B Spec | C Rustig |
|---|---|---|---|
| Brand: identifiable without the logo? | strong (serif plus orange italic is unmistakable, but it reads "boutique" more than "NextX") | **strongest** (frame, mono, condensed capitals come straight from the logo) | weak (could be any good shop) |
| Composition: real hierarchy? | strong | strong | adequate (deliberately plain) |
| Photography: works with the real cut-outs? | **strong** (tinted fields make white cut-outs look intentional) | strong (plates, hatching) | adequate (white cards expose weak photos most) |
| Typography: deliberate system? | strong (serif, sans, small caps) | strong (condensed, mono) | adequate (one family, well sized) |
| Product discovery | adequate (the price list is great, filtering is not designed) | strong (index, counts, status tags) | **strongest** (search, chips, filter, scarcity strip) |
| Mobile: designed, not stacked? | strong (image first, swipe row) | adequate (heavy type, long cell stack) | **strongest** (bottom bar, sticky buy) |
| Detail: finish | strong | strong | strong |
| Authenticity: a real operating retailer? | adequate (needs editorial content NextX does not have) | strong | strong |

**Where each is weaker**

- **A** depends on content you do not have yet: it shines with one hero product and written copy, and it
  only has one real description. With 15 products and no stories it would feel thin by week two. Serif at
  display size is lovely and reads poorly at body size (I fixed that on the product page).
- **B** is the most distinctive and the coldest. A first-time buyer scanning for "a cheap cable" meets
  a lot of technical typography. Mono prices are less friendly than a plain bold figure. Heavy on mobile.
- **C** is the easiest to use and the least NextX. It will not be remembered, and it makes weak
  third-party photos obvious.

Not judged: hover and keyboard behaviour, real-device scrolling, and performance (these are static previews).

## 5. Dashboard: what changes in every concept

Whatever you pick, these are the structural problems to fix. None removes a capability.

**The 27 current entries fit into 6 or 7 groups, with sub-tabs inside Money.**

| Group | Current entries it absorbs |
|---|---|
| Sell | Orders, Customers, Requests, **Sales (currently not in the menu)** |
| Products | Products, Bundles, Categories, Price lists |
| Stock | Inventory, Reorder advice |
| Buy | Suppliers, Purchase orders |
| Money | Finance, Cash ledger, Wallets, Invoices, Obligations, Exchange rates, Reconciliation, Expenses, Recurring expenses, Commissions (second-level tabs) |
| Insight | Reports, Owners |
| Shop and settings | Storefront, Storefronts, Settings |

Common rules the previews demonstrate:

1. **Four primary jobs are one click from Home:** Record a sale, Adjust stock, Orders, Products.
2. **Home is a queue, not a wall of panels:** "Needs attention" first, each item with its action.
3. **SRD and USD never share a number.** Separate figures, labelled, with a plain "never added together".
4. **Descriptive page intros go.** Titles carry the page; help moves behind an info control.
5. **Tables get one job each:** fewer columns by default, sticky first column, status as text plus
   shape not only colour, horizontal scroll never needed at 1440.
6. Dashboard figures in the previews are **sample numbers** (a yellow banner says so). Product names and
   prices are real; the books are not.

## 6. Recommendation

**Build B's identity on C's mechanics.**

- **Look and structure from B:** the ruled-cell system, condensed capitals, mono for data, numbered index,
  hatched sold-out, orange used only as status and action. It is the only direction that is recognisably
  NextX from the logo's own geometry, it handles white cut-outs, and the "Index" suits a catalogue of 15 to
  about 200 products.
- **Behaviour from C:** search-first header, category chips with counts, an "only in stock" toggle, the
  "Bijna uitverkocht" strip, bottom tab bar and sticky buy bar on phones, stock per pickup location
  on product pages, plain bold prices. This is what makes B easy rather than merely distinctive.
- **A's serif is not adopted for the shop**, but its editorial hero is a good template for occasional
  campaign pages later.
- **Dashboard:** C's "Werkbank" information architecture (primary actions, attention queue) with B's dense
  ruled tables for lists and B's rail grouping for navigation.

If you prefer the safest, most conventional result, C alone is the lowest-risk choice. If you want the
most personality with the least dependence on content you do not have, B. A only pays off once there is editorial content.

## 7. Decisions I need from you

1. **Direction:** A, B, C, or "B with C's mechanics" (my recommendation)? Anything to take from another concept?
2. **Photography rights and plan:** are the current product photos yours to use? Will you commission or
   take consistent product photos? Until then the shop will look weaker than any of these previews suggest.
3. **Public pickup stock:** show stock and street addresses per location on product pages (as the live shop
   does and concepts A and C show)? Your earlier notes said pickup information contradicted itself.
4. **Scarcity labels** ("Nog 1", "Nog 2") on cards and a "Bijna uitverkocht" strip: use real counts, or hide them?
5. **Language:** shop in Dutch and staff app in English, as now, or one language?
6. **Dark header and footer:** B puts the logo on black (it looks best there). Fine, or light only?
7. **Menu grouping** for the dashboard as tabled in section 5, including adding Sales to the menu.

## 8. How the previews are isolated

- Routes under `src/app/(preview)/preview/`; components in `src/preview/`; data in `src/preview/catalog.ts`.
- The layout calls `notFound()` when `NODE_ENV` is `production`, and `/preview` is not in the public-path
  list, so any deployed host sends signed-out visitors to `/login` anyway. Both are covered by
  `tests/unit/preview-isolation.test.ts`.
- No database access, no migrations, no change to orders, ledger, inventory, payments or the live storefront.
- The photographs live in `public/dev-fixtures/live/` (gitignored). On a machine without them the preview
  pages render with missing images. They are never part of a build you would deploy.

## 9. Not done on purpose

No site-wide implementation, no changes to `/`, `/shop`, `/products/[slug]`, `/setups/[slug]`, `/cart`
or the admin pages, no deployment. Those wait for your decision above.


## 10. Decision and implementation (2026-10-17)

**Owner decision:** concept C, "Rustig". Photographs: the owner's to use; consistent reshoot planned.
This was chosen over the recommendation (B's identity on C's mechanics), so B's ruled-cell identity,
mono data and hatched sold-out styling were **not** adopted; A's serif was not adopted either.

What was built, on the real shop code (not the previews):

- **Storefront** (`/`, `/shop`, `/products/[slug]`, `/setups/[slug]`, `/cart`): white page, wide search
  header, category chips with counts, an "only in stock" toggle, sort and a filters sheet, white product
  cards with the price as the largest figure and a plain stock pill, the real "Bijna uitverkocht" strip,
  stock per pickup location on the product page, a sticky buy bar and a four-tab bar on phones.
  The home page has no banner: it is the shop. The old hero, tiles and dark stage were removed.
- **Dashboard:** the Werkbank structure. 28 pages in 8 groups with the current group open (Sales added to
  the menu), four action tiles on Home with "Needs attention" directly beneath, page explanations behind an
  info mark, black primary buttons, white panels, quieter tables.
- **Kept from the earlier work:** the neutral URL structure and redirects, the 404/410 behaviour, SRD
  formatting, the WhatsApp message semantics, all migrated data and finance code (untouched).
- **Bugs fixed while verifying:** `text-base` (a font size) was being used as a text colour, which would have
  produced black text on black buttons; the cart showed the meaningless variant name "Standaard"; the quantity
  field and the sort select had no visible keyboard focus; the Overview scrolled sideways on phones.
- **Previews:** kept under `/preview` (local only) as a record; A and B remain available if a later
  campaign page wants them.

Still open: the shop's category names are English ("In-Ear Monitor", "Wireless Earbuds"), which is shop
data to rename in the dashboard, not code. The photographs, as before, are the main limit on quality.
