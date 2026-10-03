import { describe, expect, it } from 'vitest'
import { DEFAULT_WHATSAPP_NUMBER, resolveWhatsappNumber, whatsappDigits, whatsappLink } from '@/lib/storefront/contact'

describe('WhatsApp number', () => {
  it('the fallback is the real NextX number, never the old made-up one', () => {
    expect(DEFAULT_WHATSAPP_NUMBER).toBe('+5978318508')
    expect(whatsappDigits(DEFAULT_WHATSAPP_NUMBER)).not.toBe('5978555555')
  })
  it('normalises every spelling of the store setting to wa.me digits', () => {
    for (const raw of ['+597 831-8508', '+5978318508', '597 831 8508', '(597) 831-8508']) expect(whatsappLink(raw)).toBe('https://wa.me/5978318508')
  })
  it('falls back when the setting is missing, empty or junk', () => {
    for (const raw of [undefined, null, '', '   ', 'n/a', '123']) expect(resolveWhatsappNumber(raw)).toBe(DEFAULT_WHATSAPP_NUMBER)
  })
  it('url-encodes the message', () => {
    expect(whatsappLink('+5978318508', 'Hallo NextX! 1 x KZ & co')).toBe('https://wa.me/5978318508?text=Hallo%20NextX!%201%20x%20KZ%20%26%20co')
  })
})
