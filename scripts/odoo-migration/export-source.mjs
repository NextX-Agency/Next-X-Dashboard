// Read-only snapshot of the catalogue data that Odoo needs, taken from Supabase.
//
//   node scripts/odoo-migration/export-source.mjs
//
// Needs DATABASE_URL (or DIRECT_URL) in the environment / .env.local. Runs inside a
// READ ONLY transaction, so it cannot change the source even by mistake.
// Customers, wallets, sales and every other private table are deliberately NOT exported:
// this snapshot only holds what the public storefront already shows, plus stock and cost.
import { PrismaClient } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = join(root, 'docs', 'odoo-migration', 'private', 'source')
mkdirSync(out, { recursive: true })

const prisma = new PrismaClient()

const write = (name, rows) => {
  writeFileSync(join(out, name), JSON.stringify(rows, null, 2) + '\n')
  console.log(`${name}: ${rows.length} rows`)
}

try {
  await prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')

      write(
        'items.json',
        await tx.$queryRawUnsafe(`
          select i.id::text, i.name, i.brand, i.description, i.catalog_type, i.is_public, i.is_combo,
                 i.category_id::text, c.name as category,
                 i.purchase_price_usd::float8 as purchase_price_usd,
                 i.selling_price_srd::float8 as selling_price_srd,
                 i.selling_price_usd::float8 as selling_price_usd,
                 i.image_url, i.created_at, i.updated_at
          from items i left join categories c on c.id = i.category_id
          where i.deleted_at is null
          order by i.catalog_type, i.created_at, i.id`)
      )
      write(
        'categories.json',
        await tx.$queryRawUnsafe(`select id::text, name, catalog_type from categories order by catalog_type, name`)
      )
      write(
        'locations.json',
        await tx.$queryRawUnsafe(`select id::text, name, is_active, catalog_type from locations order by name`)
      )
      write(
        'stock.json',
        await tx.$queryRawUnsafe(`
          select s.item_id::text, s.location_id::text, s.quantity::int, s.reserved_quantity::int
          from stock s join items i on i.id = s.item_id
          where i.deleted_at is null order by s.item_id, s.location_id`)
      )
      write(
        'combo_items.json',
        await tx.$queryRawUnsafe(`select combo_id::text, item_id::text, quantity::int from combo_items order by combo_id, item_id`)
      )
      // Independent evidence for each product's cost: the cost snapshot on historical sale lines.
      write(
        'cost-evidence.json',
        await tx.$queryRawUnsafe(`
          select item_id::text, count(*)::int as lines,
                 count(*) filter (where cost_is_estimated)::int as estimated_lines,
                 count(distinct unit_cost_usd) filter (where unit_cost_usd > 0)::int as distinct_costs,
                 min(unit_cost_usd) filter (where unit_cost_usd > 0)::float8 as min_cost,
                 max(unit_cost_usd) filter (where unit_cost_usd > 0)::float8 as max_cost
          from sale_items group by item_id`)
      )
      // Public storefront copy only (what shop-nextx.com already shows); no payout rules or internal settings.
      write(
        'store-settings.json',
        await tx.$queryRawUnsafe(`
          select key, value from store_settings
          where key in ('store_name','whatsapp_number','store_address','store_email','store_description','hero_title','hero_subtitle','watches_hero_title','watches_hero_subtitle','watches_store_description')
          order by key`)
      )
      write(
        'exchange_rates.json',
        await tx.$queryRawUnsafe(`select usd_to_srd::float8, set_at, is_active from exchange_rates order by set_at desc`)
      )
    },
    { timeout: 60_000 }
  )
} finally {
  await prisma.$disconnect()
}
