import type { AvailabilityLine, WireOrderRequest } from './odoo/wire'

/**
 * Validation of what the BROWSER may send. The Odoo addon validates again; this layer exists so junk never
 * leaves our server and so error messages are friendly. Hand-rolled on purpose: it is ~40 lines, no dependency.
 */
const MAX_LINES = 20
const MAX_QTY = 50
const REF_RE = /^[A-Za-z0-9_-]{8,64}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const clean = (v: unknown, limit: number) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, limit)

export function parseLines(raw: unknown): AvailabilityLine[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) return null
  const merged = new Map<string, number>()
  for (const item of raw) {
    const id = (item as { product_id?: unknown })?.product_id
    const qty = (item as { quantity?: unknown })?.quantity
    if (typeof id !== 'string' || id.length < 1 || id.length > 64) return null
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return null
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + qty))
  }
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }))
}

export type ParsedOrder = { ok: true; order: WireOrderRequest } | { ok: false; message: string }

export function parseOrder(body: unknown): ParsedOrder {
  const b = (body ?? {}) as Record<string, unknown>
  const customer = (b.customer ?? {}) as Record<string, unknown>
  const name = clean(customer.name, 80)
  const phone = clean(customer.phone, 30)
  const email = clean(customer.email, 120)
  const ref = typeof b.client_ref === 'string' ? b.client_ref : ''
  const lines = parseLines(b.lines)

  if (!REF_RE.test(ref)) return { ok: false, message: 'Ongeldige bestelling. Ververs de pagina en probeer opnieuw.' }
  if (name.length < 2) return { ok: false, message: 'Vul je naam in.' }
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return { ok: false, message: 'Vul een geldig telefoonnummer in.' }
  if (email && !EMAIL_RE.test(email)) return { ok: false, message: 'Het e-mailadres is niet geldig.' }
  if (!lines) return { ok: false, message: 'Je winkelmand is leeg of ongeldig.' }

  return {
    ok: true,
    order: {
      client_ref: ref,
      customer: { name, phone, ...(email ? { email } : {}) },
      ...(typeof b.pickup_location_id === 'string' && b.pickup_location_id ? { pickup_location_id: clean(b.pickup_location_id, 64) } : {}),
      ...(b.note ? { note: clean(b.note, 500) } : {}),
      lines,
    },
  }
}
