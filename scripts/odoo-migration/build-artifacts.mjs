// Derives every migration artifact from the read-only snapshot in docs/odoo-migration/source/.
//
//   node scripts/odoo-migration/build-artifacts.mjs
//
// Deterministic: the same snapshot always produces byte-identical output, so reruns are safe and
// diffs show real data changes only. Nothing here talks to Supabase or Odoo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const src = name => JSON.parse(readFileSync(join(root, 'docs/odoo-migration/private/source', name), 'utf8'))

const items = src('items.json')
const locations = src('locations.json')
const stock = src('stock.json')
const fx = src('exchange_rates.json')

// ---------------------------------------------------------------- slugs
export function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
    .replace(/-+$/g, '')
}

// A slug is permanent once published. Items already in the registry keep theirs even if renamed;
// only new items get a derived slug, de-duplicated with -2, -3 in creation order.
const registryPath = join(root, 'src/data/storefront-slugs.json')
let registry = {}
try {
  registry = JSON.parse(readFileSync(registryPath, 'utf8'))
} catch {}

const taken = new Set(Object.values(registry).map(r => `${r.catalog}/${r.slug}`))
for (const item of items) {
  if (registry[item.id]) continue
  const base = slugify(item.name) || item.id
  let slug = base
  for (let n = 2; taken.has(`${item.catalog_type}/${slug}`); n++) slug = `${base}-${n}`
  taken.add(`${item.catalog_type}/${slug}`)
  registry[item.id] = { slug, catalog: item.catalog_type }
}
const sortedRegistry = Object.fromEntries(Object.entries(registry).sort(([a], [b]) => a.localeCompare(b)))
mkdirSync(dirname(registryPath), { recursive: true })
writeFileSync(registryPath, JSON.stringify(sortedRegistry, null, 2) + '\n')

// ---------------------------------------------------------------- redirects
// Every URL the live shop has ever served for a product: /catalog/<id> (old), /audio/<id>, /watches/<id>.
const redirects = []
for (const item of items) {
  if (!item.is_public || item.is_combo) continue
  const { slug, catalog } = registry[item.id]
  const dest = `/${catalog}/${slug}`
  redirects.push([`/catalog/${item.id}`, dest])
  redirects.push([`/${catalog}/${item.id}`, dest])
}
// Public artifacts go to docs/odoo-migration; anything carrying cost or stock lives in private/ (gitignored: the repo is public).
const out = join(root, 'docs/odoo-migration')
const priv = join(out, 'private')
const csvCell = v => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const csv = (head, rows) => [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n') + '\n'

writeFileSync(
  join(root, 'src/data/legacy-product-redirects.json'),
  JSON.stringify(redirects.map(([source, destination]) => ({ source, destination, permanent: true })), null, 2) + '\n'
)
writeFileSync(join(out, 'redirect-map.csv'), csv(['from', 'to', 'status'], redirects.map(r => [...r, 301])))

// ---------------------------------------------------------------- Odoo product manifest
// Brand spellings differ in the source ("CURREN"/"Curren", "INVICTA"/"Invicta"); Odoo gets one
// canonical spelling per brand so tags and filters do not split.
const brandCanon = new Map()
for (const i of items) {
  if (!i.brand) continue
  const key = i.brand.trim().toLowerCase()
  const cur = brandCanon.get(key)
  // prefer a mixed-case spelling over ALL CAPS
  if (!cur || (cur === cur.toUpperCase() && i.brand !== i.brand.toUpperCase())) brandCanon.set(key, i.brand.trim())
}
const locName = Object.fromEntries(locations.map(l => [l.id, l.name]))

const manifestRows = items.map(i => [
  `nextx_supabase.item_${i.id}`,
  i.name.trim(),
  i.catalog_type,
  i.category ?? '',
  i.brand ? brandCanon.get(i.brand.trim().toLowerCase()) : '',
  i.is_combo ? 'combo' : 'storable',
  i.selling_price_srd ?? '',
  i.selling_price_usd ?? '',
  i.is_combo ? '' : i.purchase_price_usd,
  i.is_public && !i.is_combo ? 'yes' : 'no',
  registry[i.id].slug,
  i.image_url ?? '',
])
writeFileSync(
  join(priv, 'odoo-product-manifest.csv'),
  csv(
    ['external_id', 'name', 'catalog', 'category', 'brand', 'type', 'price_srd', 'price_usd', 'source_cost_usd', 'published', 'slug', 'source_image_url'],
    manifestRows
  )
)

// ---------------------------------------------------------------- stock reconciliation
// Expected state after the one-time opening-inventory load. "odoo_on_hand" is filled by
// reconcile-odoo.mjs once Odoo is reachable; blank means NOT YET VERIFIED, never "ok".
const itemById = new Map(items.map(i => [i.id, i]))
const stockRows = stock
  .filter(s => itemById.has(s.item_id))
  .map(s => [
    `nextx_supabase.item_${s.item_id}`,
    itemById.get(s.item_id).name.trim(),
    `nextx_supabase.location_${s.location_id}`,
    locName[s.location_id] ?? '?',
    s.quantity,
    s.reserved_quantity,
    '',
    'NOT VERIFIED',
  ])
writeFileSync(
  join(priv, 'stock-reconciliation.csv'),
  csv(['item_external_id', 'item', 'location_external_id', 'location', 'supabase_on_hand', 'supabase_reserved', 'odoo_on_hand', 'status'], stockRows)
)

// ---------------------------------------------------------------- summary
const totalUnits = stock.reduce((a, s) => a + s.quantity, 0)
const perLoc = {}
for (const s of stock) perLoc[locName[s.location_id]] = (perLoc[locName[s.location_id]] ?? 0) + s.quantity
const activeFx = fx.find(r => r.is_active)
const summary = {
  items: items.length,
  publicStorable: items.filter(i => i.is_public && !i.is_combo).length,
  combos: items.filter(i => i.is_combo).length,
  stockRows: stock.length,
  totalUnits,
  perLocation: perLoc,
  redirects: redirects.length,
  brands: [...brandCanon.values()],
  itemsWithoutCategory: items.filter(i => !i.category).length,
  itemsWithoutBrand: items.filter(i => !i.brand).length,
  nonComboZeroCost: items.filter(i => !i.is_combo && !(i.purchase_price_usd > 0)).length,
  activeFx: activeFx && { usdToSrd: activeFx.usd_to_srd, setAt: activeFx.set_at },
  pricesNotAtFx: activeFx
    ? items.filter(i => i.selling_price_srd && i.selling_price_usd && Math.abs(i.selling_price_srd / activeFx.usd_to_srd - i.selling_price_usd) > 0.01).length
    : null,
}
writeFileSync(join(out, 'source-summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(summary)
