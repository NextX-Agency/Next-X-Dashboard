import 'server-only'

import { isOdooConfigured } from '@/lib/storefront/odoo/client'

export type StorefrontSource = 'supabase' | 'odoo'

/**
 * Which system the public catalogue is read from. Default is `supabase`, i.e. today's behaviour, so
 * deploying this code changes nothing until STOREFRONT_SOURCE=odoo is set on an environment.
 * Asking for Odoo without credentials falls back to Supabase and says so loudly instead of
 * serving an empty shop.
 */
export function getStorefrontSource(): StorefrontSource {
  if (process.env.STOREFRONT_SOURCE !== 'odoo') return 'supabase'
  if (!isOdooConfigured()) {
    console.error('[storefront] STOREFRONT_SOURCE=odoo but ODOO_STOREFRONT_URL/SECRET are missing; serving from Supabase')
    return 'supabase'
  }
  return 'odoo'
}
