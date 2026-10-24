/**
 * Normalisers for the free-text business settings that end up on the public shop, invoices and
 * WhatsApp links. Each returns the cleaned value, or null when the input cannot be used, so the
 * settings schema can report a precise message instead of publishing a dead link.
 *
 * Suriname numbers have seven digits and the country code is 597.
 */

const COUNTRY_CODE = '597';

/**
 * A phone / WhatsApp number as international digits with a leading "+" (e.g. "+5978123456").
 * Accepts spaces, dashes, dots and brackets, a leading "+" or "00", and a bare seven-digit local
 * number, which gets the Suriname country code. Returns null for anything that is not 7 to 15 digits.
 */
export function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 7) digits = `${COUNTRY_CODE}${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('0')) return null;
  return `+${digits}`;
}

/** An Instagram handle from "@name", "name" or a profile URL. Lower-case handle only. */
export function normaliseInstagram(raw: string): string | null {
  let value = raw.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(
    value,
  );
  if (url?.[1]) value = url[1];
  value = value.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(value) ? value.toLowerCase() : null;
}

/** 24-hour "HH:MM". Accepts "9:30" and pads it. */
export function normaliseClockTime(raw: string): string | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  return match ? `${match[1]?.padStart(2, '0')}:${match[2]}` : null;
}

/** An https URL or a root-relative path; anything else (javascript:, data:, http:) is refused. */
export function normaliseAssetUrl(raw: string): string | null {
  const value = raw.trim();
  if (value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !/\s/.test(value) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Character budgets for the public hero and announcement, shared with the live preview. */
export const PUBLIC_COPY_LIMITS = {
  announcement: 160,
  heroTitle: 90,
  heroBody: 320,
  supportTitle: 90,
  supportBody: 320,
  openingHours: 300,
} as const;
