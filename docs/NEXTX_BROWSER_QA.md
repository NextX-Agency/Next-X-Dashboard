# Browser QA register, 18 Oct 2026

Branch `nextx-dashboard-2.0`. Read with `docs/NEXTX_PROGRESS.md` (state and how to run it) and
`docs/NEXTX_VARIANTS_AND_IMAGES.md` (the rules being tested). This file is the evidence trail: what was run
where, what broke, what was fixed and re-tested, and what was **not** tested.

## 1. Environments, and what each can prove

| Environment | What it is | Used for | Cannot prove |
|---|---|---|---|
| **Local rehearsal** (`localhost:3000`, disposable PostgreSQL on 55432) | The branch's code against the 15-product fixture that mirrors the live shop, plus a **synthetic** variant fixture (`scripts/rehearsal/variant-fixture.sql`: "KZ Test IEM" with Black/Silver/Purple and "KZ Test Case" with Red/Blue, stand-in photographs) | Every interactive test below | Real data volumes, real photographs per option, real users, roles other than the review owner |
| **Staging** (`nextx.nextxagency.com`, owner's signed-in browser session) | Migrated real data, **older build** (no variant-aware shop, no new filters; confirmed by the Products filter bar and `/shop?colour=` ignoring the parameter) | Read-only reconnaissance: product list, public shop, image delivery | The new code: it is not deployed there |
| **Production** (`shop-nextx.com`, old `main`) | Untouched | Nothing | Everything |

No role other than owner was exercised (the local sign-in hook signs in as an owner; I had no staff/viewer
credentials). No real-device test was possible (emulated 390 / 768 / 1440 px browsers only). No screen reader.

## 2. Automated browser suites (Playwright, Chromium) and unit tests

Final run at the head of the branch (sixth session, with fixes S-3 to V-6), after resetting the disposable database. Whole-session totals: unit 346/346; Playwright 46/46 (store-local, store-a11y, dashboard-local, purchasing-local, on the plain fixture) and 24/24 (variants-local, filters-local, on the variant fixture):

| Suite | Result | What it covers |
|---|---|---|
| Unit (`pnpm test`) | **375 / 375** | includes the image policy, sale picker rules (incl. the cost-ranged picker), SRD formatting, default line price, list-filter parsing |
| `store-local` + `store-a11y` | 36 / 36 | storefront structure, redirects, 404/410, English, overflow at 3 widths, names/labels/landmarks, focus, dialogs, tap size, contrast, reduced motion |
| `dashboard-local` | 9 / 9 (incl. the draft, date and phone-order regression test) | every staff page loads without console errors or horizontal overflow; record a sale (picker); oversell policy; expense; activity log; new order (picker); create a product with two options and refuse a duplicate SKU |
| `purchasing-local` | 1 / 1 | supplier, purchase order (lines chosen in the photo picker), receipt: stock rises by exactly what was received, then the units appear in the sale picker |
| `filters-local` (needs the variant fixture) | 7 / 7 | photo picker on purchase orders (option photograph, reference cost, change, merge), bundles (component photograph, saved) and quotes (opened from the row menu, price filled); filters: orders (customer, date range incl. the UTC day boundary, payment status, combined, empty state), ledger (type, currency, wallet, date range), customers (last-order range), expenses (date range). Fixtures are inserted with a per-run marker |
| `variants-local` (needs the variant fixture) | 17 / 17 (incl. the options-on-cards and buy-bar tests) | option page sync (photo, price, stock, pickup, URL), WhatsApp message, no-photo option, cart photo, combined filters, chips, Clear all, filter sheet, empty result, matched-card price/stock, picker search/option/quantity/keyboard/focus return, picker filters, no horizontal overflow at 390/768/1440 |
| Lint, types | Biome clean (404 files), `tsc` clean | |
| Production build (`next build`) | passes | placeholder self-hosted env, as in the progress doc |

Not run: `smoke`, `access`, `storefront` (they need a staging login and write to staging).

## 3. Interactive browser sessions (by hand, in the built-in browser)

- Sale picker at 1440 and 390 px: open from "Add product", search "kz test iem", Enter, switch Black / Silver /
  Purple and read the photograph file, price and per-location stock from the DOM each time, add 2 × Black,
  Escape, focus returns to "Add another product", line shows the option photograph, SKU, quantity 2, price 30.00.
  Recorded a sale (V001, 3 × 38.96 = 116.88) on the disposable database.
- SRD sale: currency SRD at 38.00; card price, default line price and "Converted at 38.00 SRD per USD" read back.
  This found S-1 below.
- Product page at 390 px: swatches, tick on the selected option, "Sold out" text, pickup list per option,
  sticky bar.
- Shop at 390 px: filters sheet opened, Silver added, URL `?colour=Black,Silver`, counts read back, sheet stays
  open; chips and Clear all.
- Dashboard: products with the new filters (9 queries), inventory (10), sales (12), edit a product, make a photo
  the main photo of its option, rename a SKU to one in use (refused with the owner of the SKU named).
- Staging, read-only: Overview, Products (34 rows), public `/shop` and every product image URL (see the media audit).

**Sixth session (18 Oct, built-in browser pane, development server, disposable database):**

- Shop at 1440 and 390 px: home, `/shop` search by model, partial name, brand, SKU, no match; brand, category, in-stock, sort and combined queries (read back from the HTML); the filter sheet on a phone (opened, a price tier applied, count and tick read back, Clear shown).
- Product page at 1440 and 390 px; add to cart; the cart (a stale line from an earlier session for a product that no longer exists was handled and removed); the **WhatsApp link read, not sent** (product, SKU, quantity, price, estimated total, pickup place and date were all correct).
- Colour-option product at 390 px (synthetic fixture): swatches, sold-out option, sticky buy bar. This found V-5 and V-6.
- Dashboard as owner: Overview; Record a sale at 1440 px (picker, search, Enter-Enter keyboard add, Escape, line with photograph, Save as draft), then the draft's page, "Save and confirm" (receipt +$38.96, stock −1 unit posted) and the stored dates read in SQL. This found S-3, S-4, S-5. Record a sale at 390 px found U-7.
- Not done by hand this session: every other dashboard page (only the automated page-load test), tablet width by hand, the staging site (needs the owner's sign-in; no staging session was available to me), any role other than owner.

## 4. Issue register

Severity: P0 launch blocker, P1 must fix before launch where it blocks common work, P2 can wait.
"Found by" is honest about how: a defect seen in the running browser, one a test caught, or one found by
reading code and then confirmed.

| ID | Sev | Where | Defect | Found by | Root cause | Fix | Retest |
|---|---|---|---|---|---|---|---|
| V-1 | P1 | Record a sale | Products chosen from a text dropdown: no photo, no model, no brand, no per-location stock; an option could be confused with its sibling | the brief; the old combobox | `Combobox` over `listVariantOptions` | `aaaac39` visual picker | `variants-local` picker tests, hand run |
| V-2 | P1 | Product page | Gallery showed every photograph of every colour whatever the option; price/stock changed but not the photographs; pickup stock was **summed across options** | code + browser | gallery read all `product_images`, `variantId` never selected | `15fef8a` shared `ProductSelectionProvider`, `galleryImages` policy | `variants-local` 1, 2, 3 |
| V-3 | P1 | Cart | The cart showed **no photograph** at all | browser | cart line had no image field | `15fef8a` (line carries the option photo; the server quote refreshes it) | `variants-local` 4 |
| V-4 | P1 | Pickup stock | Per-location stock ignored legacy movements with no location while the headline figure counted them at the main location, so the two disagreed | code, then confirmed with a null-location movement | `getStorefrontAvailability` | `15fef8a` | inserted +3 with no location: page shows 8 = 5 + 3 at the main location |
| F-1 | P1 | Shop filters | No way to filter by colour or any option; "in stock" matched a product if **any** variant had stock | brief; query | no variant-level conditions | `2dbab42` single-variant matching, facets, chips | `variants-local` 5–9 |
| F-2 | P2 | Shop cards | After the first F-1 pass a card matched on Purple still said "from SRD 1,500 / In stock" (the product's range) | browser (390 px screenshot) | card used product-level price/stock | `f425cf3` card shows the matched option's price, stock and name | `variants-local` 15 |
| D-1 | P1 | Dashboard sales filter | The new date range was off by one day (a sale on Oct 18 appeared under "to Oct 17") | browser, querying the list | compared `sold_at::date` in the session time zone; the display and the stored day are UTC | `947cfd9` compare in UTC | read back 5 range combinations |
| S-1 | **P1** | All SRD money in the dashboard and the customer quote page | An SRD amount is written **"$246.62"**, the US dollar sign: "Posts one receipt for $246.62", sale/PO totals, the public quote. Ambiguous money on a document a customer reads | browser (picker price), then confirmed in Node: `Intl` narrow symbol of SRD is "$" | `formatMoney` used `currencyDisplay: 'narrowSymbol'` | `5448223` non-USD amounts are written with their code ("SRD 246.62") | unit test; browser read-back |
| S-2 | P1 | New order, SRD | The default unit price for an SRD order was the **USD list price number** (6.49 shown as SRD 6.49) | code | `toDecimalString(listPriceCents, currency)` with no conversion | `0c8e79a` converted at the current rate (`defaultUnitPrice`) | unit tests; `dashboard-local` new order |
| E-1 | P1 | Suppliers and Categories, when the list is empty | The empty state and the header each mounted the same URL-driven sheet, so one click opened **two stacked dialogs with duplicate element ids** | e2e (strict-mode locator) | two `<…Sheet/>` instances read the same `?new-supplier` key | `78e63f9` the empty state links to the one sheet | `purchasing-local` |
| A-1 | P2 | Product, sale, order, purchase-order, bundle forms | Rows 2 and beyond of a repeated line had **no accessible name** (empty `<label>`) | e2e (`getByLabel`) | `label={index === 0 ? 'Qty' : ''}` | `cdf63b8` `hideLabel` keeps a screen-reader-only label | `dashboard-local` create product |
| U-1 | P2 | Product create | After "Create product" you land on the list; a new product cannot be published without a photograph | walkthrough | redirect to `/items` | `cdf63b8` opens the product's own page with "Add photos next" | `dashboard-local` |
| U-2 | P2 | Picker on a phone | Close/Done/stepper buttons 36 px, "Back to results" 18 px high | measured in the browser at 390 px | sizes | `f425cf3` ≥ 44 px | re-measured in the e2e overflow run |
| U-3 | P2 | SKU conflict | "That already exists. Check for an existing record with the same code or number." | e2e | unique index error text | `8ca2a49` names the SKU and the product that owns it | `dashboard-local` |
| U-4 | P2 | Product form | Hub, app, Wi-Fi, power, subscription and installation fields (smart-home leftovers) filled the form for audio and watches | walkthrough | always rendered | the block is a closed disclosure unless the product already uses it | `dashboard-local` smart-home test |
| U-5 | P2 | Every form on a phone | Inputs were 36 px high with 13 px text (small tap target; iOS zooms into fields under 16 px) | measured at 390 px | `control` class | 44 px and 16 px text below the `sm` breakpoint | `dashboard-local` smart-home test (height) |
| P-1 | P2 | Purchase orders, bundles, quote dialogs | Still used the text dropdown: no photograph, no option beside the line; a purchase order could not show which colour was being ordered | the brief (was O-6) | `Combobox` over `listVariantOptions` / a native `<select>` over `listQuoteVariantOptions` | `fc0565e` the sale picker is generic (wording, the number shown, optional quantity) and drives all three; a purchase order shows the **reference cost**, not the shelf price; quote dialogs take the request's quantity | `filters-local` 1-3, `purchasing-local` |
| Q-1 | **P1** | Quote requests, row menu: "Create quote" and "Convert to sale" | Choosing either closed the menu and **the dialog disappeared with it**, so neither action could be used from the list | e2e (the new quote picker test: the sheet "detached from the DOM") | `CreateQuoteDialog` / `ConvertQuoteDialog` were rendered inside the Radix menu content, which unmounts when the menu closes (the Edit sheet was already rendered beside the menu) | `fc0565e` the dialogs are controlled and rendered next to the menu | `filters-local` 3 submits a quote ("Secure quote link copied") |
| L-1 | P2 | Orders, cash ledger, customers, expenses | No way to narrow by customer, date, payment, currency, wallet or direction | the brief (was O-7) | no filter fields | `fc0565e`, see section 7 for what each filter means | `filters-local` 4-7 |
| U-6 | P2 | Date-range filter on a phone | The "to" date ran past the right edge of the card (also on Sales) | browser at 375 px | non-wrapping flex row | `fc0565e` wraps | screenshot at 375 px; no horizontal overflow on /ledger, /orders, /purchase-orders/new |
| S-3 | **P1** | Record a sale, "Save as draft" | The confirmation toast said "Sale V001 recorded: $38.96 revenue · $38.96 gross profit" for a **draft**, which has moved no stock, booked no cost and posted no receipt | browser (draft saved by hand on the disposable database) | `createHook.onSuccess` always used the "recorded" text with `totalUsdCents - cogsCents`; a draft has `cogsCents` 0 | the toast now reads "Draft V002 saved: nothing is booked until you confirm it" and shows no profit (`input.confirm` decides) (`5915573`) | `dashboard-local` "a draft books nothing" (fails without the fix, passes with it); browser read-back |
| S-4 | P1 | Sales list and sale page, draft rows | A draft showed cost $0.00 and a green **100.0% margin** (and the same on every line), as if the whole price were profit | browser | margin was computed from `cogsCents` which a draft has not booked yet | cost, gross and margin show "—" for a draft on the list (desktop and phone) and the sale page (lines, totals, phone cards) (`5915573`) | list and sale page read back in the browser; `dashboard-local` |
| S-5 | **P1** | Sale page, edit a draft then "Save and confirm" | The **sale date moved back one day** (Oct 18 became Oct 17), and with it the receipt date and the exchange rate looked up for the day | browser, then the stored value (`2026-10-17 21:00:00-03`, which is 18 Oct 00:00 UTC) | the edit form's date was `sale.soldAt.slice(0, 10)` of the database's *text*, written in the database session's time zone (UTC-3 here), while the form and the stored day are UTC | `utcDateInput()` reads the UTC day of the timestamp (`src/lib/format.ts`), unit-tested; on a database whose session time zone is UTC the text was already UTC, so this is latent on the VPS but wrong on any other zone (`5915573`) | unit tests; browser: the edit form loads 2026-10-18 and the confirmed sale keeps `2026-10-18`; `dashboard-local` checks the date field after the round trip |
| U-7 | P2 | Record a sale on a phone (390 px) | "Add product" sat about 1,600 px down, below customer, date, payment and currency, which are usually left as they are | browser at 390 px | section order | below `xl` the Items section comes first (CSS `order`; the tab order is unchanged and the desktop layout is untouched) (`5915573`) | browser screenshot at 390 px; `dashboard-local` measures the button's position |
| V-5 | **P1** | Product page on a phone | The fixed buy bar read "SRD 1,500 · 1 item · Add to cart" and never named the option. The colour swatches are below the fold, so a shopper could add Black without having seen that Silver and Purple exist | browser at 390 px | the bar showed price and quantity only | the bar names the selected option ("Black · 1 item") and changes with it (`67571ce`) | `variants-local` "buy bar names the option"; browser read-back |
| V-6 | P2 | Shop cards | A product sold in three colours looked like a single item ("from SRD 1,500") until opened | browser at 390 px | `option_count` was selected by the query but never returned | cards show "3 options" (not shown on a card that already matched an option, nor on a one-option product) (`67571ce`) | `variants-local` "a card says a product has several options"; browser read-back |
| R-1 | **P1** | Shop filters, price with colour, option or stock | The price filter compared the product's cheapest price, while colour, options and stock matched one variant: a product with Black at SRD 3,000 and Silver at SRD 1,500 matched "Black, SRD 1,000 to 2,000" | brief, then code, then proven on a fixture (`price-fixture.sql`) | `price.min_price` bucket in `catalogConditions`, outside the variant `EXISTS` | one inclusive min/max range applied to the same variant row (`variantConditions`); old `?price=` links map onto it; facets give bounds, not tier counts | `catalog-local` (Graphite + 1,000 to 2,000 does not match; Pearl does, card shows Pearl SRD 1,500) |
| R-2 | P2 | Home, 768 to 1023 px | The hero's product frames collapsed to captions: the grid had a height only from `lg` | screenshot at 768 | missing `md` min-height | `md:min-h-[480px]` | screenshot at 768 |
| R-3 | P2 | Filters | "Connection" with one choice, and "New arrivals only" when nothing is new, were offered and led nowhere | browser, filter sheet | groups shown on any data | a group needs two choices; "new" needs a new arrival (facet count) | filter sheet read back |
| R-4 | P2 | Filters sheet on a phone | Opening it blocked the tap for 190 to 340 ms (lab, 4x CPU) | lab probe of three taps | the sheet mounts every group synchronously | opened in a transition | probe: 56 ms |
| R-5 | P2 | Cards | A photograph whose file fails to load showed a broken-image icon | review | plain `next/image` | `SafeImage` falls back to the placeholder | `catalog-local` (route returns 404) |
| R-6 | P2 | Cart | Nothing told the customer what happens after pressing send | brief | missing copy | "What happens next" under the button | read back |
| R-7 | P2 | Product page | No model or SKU on the page; the gallery had no keyboard or swipe | brief | missing | "Model X · SKU Y" follows the option; arrow keys and swipe; counter | `catalog-local` |

## 5. Open issues (not fixed)

| ID | Sev | Where | Defect |
|---|---|---|---|
| O-1 | **P1 (data)** | Staging Overview | "21 confirmed sales have no receipt in the ledger" and a $35 sale overdue since January. The reconciliation report explains 20 (derived zero-total reservations) plus 1 (`SALE_WITHOUT_PAYMENT_EVENT`); the owner sign-off block is still blank. Not a code defect, but production must not be cut over until it is signed |
| O-2 | P1 (process) | Release | The import tooling refuses to write without the owner's readiness report ("Migration writes require --readiness-report with every required gate set to PASS"), so the migration rehearsal, and the constraint, RLS and concurrency scripts that depend on its rows, **could not be re-run**. Constraints: 16 of 17 passed on the visual fixture, the one failure needs the imported invoice row |
| O-3 | P2 (data) | Archived watches | Colourways stored as separate products ("POEDAGAR 989 … Silver & White Dial" and "… Silver & Black Dial", "CURREN 8439 … Silver & Black" and "… Gold & Silver"). They are retired, so the shop does not show them; merging them would be an owner decision |
| O-4 | P2 | Product form | The order-reference placeholder in Amazon's format and the supplier kinds (Amazon / AliExpress / Other) remain; the smart-home block is now closed by default (see U-4) |
| O-5 | P2 | Dashboard on phones | The sale and order forms are dense on a phone (inputs are now 44 px, see U-5) |
| O-7 | P2 | Dashboard filters | Reduced: stock movement type and date range still have no list to filter (the ledger shows movements only on a sale). Purchase orders, quotes, wallets, invoices and the activity log were not in scope and have only their earlier filters |
| O-8 | P2 | Shop | The price filter is four fixed tiers, not a free range; "driver configuration" and similar technical filters are not offered because no such data is populated |
| O-9 | P2 | Staging build | `/shop?brand=kz&availability=in-stock` returned 0 products on staging (older build) while KZ products have stock; unexplained, re-test after deploying this branch |
| O-10 | P2 | Cart | A cart line whose product was removed or sold out shows three messages at once ("No price is available…", "This product is no longer available…" and the red banner); one would do. Left alone: it is correct and blocks the order |
| O-11 | P2 | Dashboard, phone | "Cancel" under the page title is indented differently from the title; the sale form's tab order follows the DOM, not the phone's visual order (Items first) |
| O-12 | P2 | Method | Every interactive check this session ran in the **development server** (slow first compile, images fade in late), in an emulated 390/768/1440 browser. Nothing was timed, and real phones were not used |

## 6. Not tested (do not claim)

- Real phones, real WhatsApp hand-off, any screen reader.
- Staff and viewer roles, and an unauthenticated visit to protected routes **on the new code** (route-access
  unit tests exist from earlier sessions and still pass; no live role session was available).
- Image upload, per-option upload and delete (needs Supabase storage; the local environment has none).
- Dashboard pages not listed in section 3 beyond "loads without console errors": reports, wallets, finance
  reconciliation, storefront management, settings saves, customer edit, payments, refunds, returns.
- The new code on staging and production.
- Facet counts under data of real size (a few hundred products).

## 7. What the new filters mean (L-1)

Read from the schema, not guessed. Every day compares the **stored UTC day**, like the date shown (see D-1);
"from" and "to" are inclusive and either may be left empty. All of it lives in the address, so a filtered list
can be shared, and a hand-edited bad value is ignored rather than raising an error (`tests/unit/list-params.test.ts`).

| List | Filter | Rule |
|---|---|---|
| Orders | Customer | the order's customer (a walk-in order has none and matches no customer) |
| | Ordered from / to | `sales.sold_at` |
| | Payment | confirmed payments against the order total: *Paid in full* (>= total), *Partly paid* (some, less than total), *Nothing paid* (none, total above zero). A **draft or cancelled** order is not owed anything, so it matches none of the three. Sales have an extra "overdue" state; orders do not |
| Cash ledger | Type | money in / money out (`direction`); *Category* is the separate, older filter |
| | Currency | the currency the money moved in (`ledger_entries.currency`; the view only carries the US-dollar amount, so the filter joins the entry) |
| | Wallet | `wallet_id`; inactive wallets are listed too because their history remains. Entries with no wallet ("Legacy") have no wallet to pick |
| | Moved from / to | `occurred_at` |
| Customers | Last order from / to | the day of the customer's latest **confirmed** sale (`v_customer_totals`); a customer who never bought matches no date range |
| Expenses | Spent from / to | `occurred_at` |

`/finance/transactions` redirects to the cash ledger, so there is one list, not two. Customers and expenses have
no currency or wallet filter on purpose (not asked for; a customer has no currency).
