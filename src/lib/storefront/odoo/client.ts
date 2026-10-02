import 'server-only'

import type {
  AvailabilityLine,
  AvailabilityResult,
  WireCatalog,
  WireOrderRequest,
  WireOrderResult,
} from './wire'

/**
 * Server-only client for the narrow Odoo storefront addon. Credentials never reach the browser:
 * this module is `server-only`, and the env vars carry no NEXT_PUBLIC_ prefix.
 */
const TIMEOUT_MS = 8_000

export class OdooStoreError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'OdooStoreError'
  }
}

export function isOdooConfigured(): boolean {
  return Boolean(process.env.ODOO_STOREFRONT_URL && process.env.ODOO_STOREFRONT_SECRET)
}

async function call<T>(path: string, init: RequestInit & { next?: NextFetchRequestConfig }): Promise<T> {
  const base = process.env.ODOO_STOREFRONT_URL
  const secret = process.env.ODOO_STOREFRONT_SECRET
  if (!base || !secret) throw new OdooStoreError('Odoo storefront is not configured')

  let res: Response
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new OdooStoreError(`Odoo unreachable: ${error instanceof Error ? error.message : 'unknown'}`)
  }

  // Orders answer with a structured body even on 4xx, so only reject unparseable responses.
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new OdooStoreError(`Odoo returned ${res.status} with a non-JSON body`, res.status)
  }
}

/** Descriptive data: cached by Next for a minute and invalidated by the `catalog` tag. */
export function fetchCatalog(): Promise<WireCatalog> {
  return call<WireCatalog>('/catalog', { method: 'GET', next: { revalidate: 60, tags: ['catalog'] } })
}

/** Availability must be fresh: never cached. */
export function fetchAvailability(lines: AvailabilityLine[]): Promise<AvailabilityResult> {
  return call<AvailabilityResult>('/availability', {
    method: 'POST',
    body: JSON.stringify({ lines }),
    cache: 'no-store',
  })
}

export function submitOrder(order: WireOrderRequest): Promise<WireOrderResult> {
  return call<WireOrderResult>('/orders', {
    method: 'POST',
    body: JSON.stringify(order),
    cache: 'no-store',
  })
}
