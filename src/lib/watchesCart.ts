import { formatCurrency, type Currency } from '@/lib/currency'

export interface WatchesCartEntry {
  id: string
  name: string
  brand?: string
  imageUrl?: string | null
  sellingPriceUsd?: number | null
  sellingPriceSrd?: number | null
  quantity: number
}

const WATCHES_CART_STORAGE_KEY = 'nextx-watches-cart'
const WATCHES_CART_EVENT = 'nextx-watches-cart-updated'

function canUseStorage() {
  return typeof window !== 'undefined'
}

function emitWatchesCartUpdate() {
  if (!canUseStorage()) return
  window.dispatchEvent(new Event(WATCHES_CART_EVENT))
}

export function loadWatchesCart(): WatchesCartEntry[] {
  if (!canUseStorage()) return []

  try {
    const saved = window.localStorage.getItem(WATCHES_CART_STORAGE_KEY)
    if (!saved) return []

    const parsed = JSON.parse(saved)
    return Array.isArray(parsed) ? parsed as WatchesCartEntry[] : []
  } catch {
    return []
  }
}

export function saveWatchesCart(items: WatchesCartEntry[]) {
  if (!canUseStorage()) return

  if (items.length > 0) {
    window.localStorage.setItem(WATCHES_CART_STORAGE_KEY, JSON.stringify(items))
  } else {
    window.localStorage.removeItem(WATCHES_CART_STORAGE_KEY)
  }

  emitWatchesCartUpdate()
}

export function upsertWatchesCartItem(item: WatchesCartEntry, quantity: number) {
  const nextQuantity = Math.max(0, quantity)
  const currentCart = loadWatchesCart()
  const existingIndex = currentCart.findIndex((entry) => entry.id === item.id)

  if (nextQuantity <= 0) {
    saveWatchesCart(currentCart.filter((entry) => entry.id !== item.id))
    return
  }

  if (existingIndex >= 0) {
    const updatedCart = [...currentCart]
    updatedCart[existingIndex] = { ...updatedCart[existingIndex], ...item, quantity: nextQuantity }
    saveWatchesCart(updatedCart)
    return
  }

  saveWatchesCart([...currentCart, { ...item, quantity: nextQuantity }])
}

export function setWatchesCartItemQuantity(itemId: string, quantity: number) {
  const currentCart = loadWatchesCart()
  const existingItem = currentCart.find((entry) => entry.id === itemId)
  if (!existingItem) return

  upsertWatchesCartItem(existingItem, quantity)
}

export function removeWatchesCartItem(itemId: string) {
  saveWatchesCart(loadWatchesCart().filter((entry) => entry.id !== itemId))
}

export function clearWatchesCart() {
  saveWatchesCart([])
}

export function subscribeWatchesCart(callback: (items: WatchesCartEntry[]) => void) {
  if (!canUseStorage()) {
    return () => {}
  }

  const handleLocalUpdate = () => callback(loadWatchesCart())
  const handleStorageUpdate = (event: StorageEvent) => {
    if (event.key === WATCHES_CART_STORAGE_KEY) {
      callback(loadWatchesCart())
    }
  }

  window.addEventListener(WATCHES_CART_EVENT, handleLocalUpdate)
  window.addEventListener('storage', handleStorageUpdate)
  callback(loadWatchesCart())

  return () => {
    window.removeEventListener(WATCHES_CART_EVENT, handleLocalUpdate)
    window.removeEventListener('storage', handleStorageUpdate)
  }
}

export function getWatchesCartQuantity(items: WatchesCartEntry[], itemId: string) {
  return items.find((entry) => entry.id === itemId)?.quantity ?? 0
}

export function getWatchesCartCount(items: WatchesCartEntry[]) {
  return items.reduce((sum, entry) => sum + entry.quantity, 0)
}

interface BuildWatchesCartWhatsAppMessageArgs {
  items: WatchesCartEntry[]
  currency: Currency
  customerName?: string
  customerPhone?: string
  customerNotes?: string
}

export function buildWatchesCartWhatsAppMessage({
  items,
  currency,
  customerName,
  customerPhone,
  customerNotes,
}: BuildWatchesCartWhatsAppMessageArgs) {
  let message = 'Hello NextX Watches,\n\n'
  message += 'I would like to place an order for:\n\n'

  items.forEach((item, index) => {
    const unitPrice = currency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
    const linePrice = (unitPrice ?? 0) * item.quantity
    const itemLabel = item.brand ? `${item.brand} ${item.name}` : item.name

    message += `${index + 1}. ${itemLabel}\n`
    message += `   ${item.quantity}x ${formatCurrency(unitPrice ?? 0, currency)} = ${formatCurrency(linePrice, currency)}\n\n`
  })

  const total = items.reduce((sum, item) => {
    const unitPrice = currency === 'SRD' ? item.sellingPriceSrd : item.sellingPriceUsd
    return sum + (unitPrice ?? 0) * item.quantity
  }, 0)

  message += '━━━━━━━━━━━━━━━━━━\n'
  message += `Total: ${formatCurrency(total, currency)}\n\n`

  if (customerName?.trim()) {
    message += `Name: ${customerName.trim()}\n`
  }

  if (customerPhone?.trim()) {
    message += `Phone: ${customerPhone.trim()}\n`
  }

  if (customerNotes?.trim()) {
    message += `Notes: ${customerNotes.trim()}\n`
  }

  message += '\nPlease confirm availability and the next steps.'
  return message
}