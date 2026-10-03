'use client'

import { useCallback, useState } from 'react'

/**
 * Client side of the Odoo checkout, shared by the catalogue page and the product page.
 * Off unless NEXT_PUBLIC_STOREFRONT_ORDERS=odoo (a public flag, not a secret), so production keeps the
 * WhatsApp hand-off. The idempotency key lives in localStorage: a double tap or a retry returns the same order.
 */
const REF_KEY = 'nextx-order-ref'
export const odooCheckoutEnabled = process.env.NEXT_PUBLIC_STOREFRONT_ORDERS === 'odoo'

export interface PlaceOrderInput {
  customerName: string
  customerPhone: string
  pickupLocationId?: string
  note?: string
  lines: Array<{ product_id: string; quantity: number }>
  storeName: string
  whatsappNumber: string
  /** Called after a successful order so the page can clear its cart. */
  onPlaced: () => void
}

export function useOdooOrder() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<{ name: string; whatsappUrl: string } | null>(null)

  const place = useCallback(async (input: PlaceOrderInput) => {
    if (input.lines.length === 0 || submitting) return
    setError(null)
    if (input.customerName.trim().length < 2 || input.customerPhone.replace(/\D/g, '').length < 7) {
      setError('Vul je naam en telefoonnummer in.')
      return
    }
    let ref = ''
    try { ref = localStorage.getItem(REF_KEY) || '' } catch {}
    if (!ref) {
      ref = crypto.randomUUID()
      try { localStorage.setItem(REF_KEY, ref) } catch {}
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_ref: ref,
          customer: { name: input.customerName.trim(), phone: input.customerPhone.trim() },
          pickup_location_id: input.pickupLocationId || undefined,
          note: input.note || undefined,
          lines: input.lines,
        }),
      })
      const data = await res.json().catch(() => null)
      if (data?.ok) {
        const number = input.whatsappNumber.replace(/[^0-9]/g, '')
        const text = `Hallo ${input.storeName}! Ik heb een bestelling geplaatst: ${data.order_name}.`
        setConfirmation({ name: data.order_name, whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(text)}` })
        try { localStorage.removeItem('nextx-cart'); localStorage.removeItem(REF_KEY) } catch {}
        input.onPlaced()
      } else {
        setError(data?.message || 'Je bestelling kon niet worden geplaatst. Probeer het opnieuw of bestel via WhatsApp.')
      }
    } catch {
      setError('Geen verbinding. Probeer het opnieuw of bestel via WhatsApp.')
    } finally {
      setSubmitting(false)
    }
  }, [submitting])

  return { submitting, error, confirmation, place }
}
