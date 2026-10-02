import 'server-only'

import type { CatalogApiData } from '@/lib/catalogData'
import { fetchCatalog } from '@/lib/storefront/odoo/client'
import { wireToCatalogData } from '@/lib/storefront/odoo/mapper'
import type { StoreCatalogKind } from '@/lib/storefront/odoo/wire'

/** Catalogue for one storefront (audio or watches), read from Odoo and shaped like the Supabase one. */
export async function getOdooCatalog(kind: StoreCatalogKind): Promise<CatalogApiData> {
  return wireToCatalogData(await fetchCatalog(), kind)
}
