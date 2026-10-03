/**
 * The NextX WhatsApp number used when the store settings cannot be loaded.
 * Confirmed against the live store setting (+597 831-8508). It used to be a made-up number in three watches components.
 */
export const DEFAULT_WHATSAPP_NUMBER = '+5978318508'

/** wa.me wants digits only, with the country code and no "+", spaces or dashes. */
export function whatsappDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '')
}

export function resolveWhatsappNumber(raw: string | null | undefined): string {
  return whatsappDigits(raw).length >= 8 ? (raw as string) : DEFAULT_WHATSAPP_NUMBER
}

export function whatsappLink(raw: string | null | undefined, text?: string): string {
  const digits = whatsappDigits(resolveWhatsappNumber(raw))
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
