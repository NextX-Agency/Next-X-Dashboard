/**
 * Wire contract between the Next.js storefront and the `nextx_storefront` Odoo addon (v1).
 *
 * The addon is the ONLY thing the storefront talks to. It exposes three narrow endpoints and no
 * generic model access, so a leaked storefront secret can read the public catalogue and create web
 * orders, nothing else. Keep this file and `odoo/addons/nextx_storefront/controllers/store.py` in sync.
 */
export type StoreCatalogKind = 'audio' | 'watches'

export interface WireProduct {
  /** External id: the original Supabase UUID for migrated products, `odoo-<id>` for new ones. */
  id: string
  odoo_id: number
  name: string
  brand: string | null
  description: string | null
  category_id: string | null
  catalog: StoreCatalogKind
  price_srd: number | null
  price_usd: number | null
  /** Absolute URL of the original-quality image served by Odoo, or null. */
  image_url: string | null
  is_combo: boolean
  created_at: string
  updated_at: string
  /** Free quantity (on hand minus reserved) per physical location. */
  stock: Array<{ location_id: string; quantity: number }>
}

export interface WireCatalog {
  version: 1
  generated_at: string
  settings: Record<string, string>
  exchange_rate: { usd_to_srd: number; set_at: string } | null
  categories: Array<{ id: string; name: string; catalog: StoreCatalogKind }>
  locations: Array<{ id: string; name: string; address: string | null }>
  products: WireProduct[]
}

export interface AvailabilityLine {
  product_id: string
  quantity: number
}

export interface AvailabilityResult {
  ok: boolean
  lines: Array<{
    product_id: string
    requested: number
    available: number
    ok: boolean
    by_location: Array<{ location_id: string; quantity: number }>
  }>
}

export interface WireOrderRequest {
  /** Idempotency key. The same key never creates a second order. */
  client_ref: string
  customer: { name: string; phone: string; email?: string }
  pickup_location_id?: string
  note?: string
  lines: AvailabilityLine[]
}

export type WireOrderResult =
  | { ok: true; order_name: string; order_id: number; reused: boolean }
  | { ok: false; error: 'unavailable' | 'invalid' | 'server'; message: string; lines?: AvailabilityResult['lines'] }
