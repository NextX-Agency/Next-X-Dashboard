/**
 * Which pickup days the shop offers, by the same rule the storefront copy states: "Same-day pickup
 * before HH:MM" when `sameDayPickupEnabled` is on, and no same-day pickup when it is off.
 *
 * Suriname has no daylight saving (UTC-3 all year), which is what keeps the clock below simple.
 */

const PARAMARIBO_OFFSET_MINUTES = -3 * 60;

/** Minutes since midnight in Paramaribo for the given instant. */
export function paramariboMinutes(now: Date): number {
  const local = new Date(now.getTime() + PARAMARIBO_OFFSET_MINUTES * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

/** Parse the stored "HH:MM" cutoff; null when empty or unreadable (no cutoff to enforce). */
function cutoffMinutes(cutoffTime: string | null | undefined): number | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((cutoffTime ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function sameDayPickupAllowed(
  settings: { sameDayPickupEnabled: boolean; pickupCutoffTime: string | null | undefined },
  now: Date = new Date(),
): boolean {
  if (!settings.sameDayPickupEnabled) return false;
  const cutoff = cutoffMinutes(settings.pickupCutoffTime);
  return cutoff === null || paramariboMinutes(now) < cutoff;
}

/** The first day a customer can be offered: today only while same-day pickup is open. */
export function firstPickupDay(
  settings: { sameDayPickupEnabled: boolean; pickupCutoffTime: string | null | undefined },
  now: Date = new Date(),
): 'today' | 'tomorrow' {
  return sameDayPickupAllowed(settings, now) ? 'today' : 'tomorrow';
}
