/**
 * Small in-memory sliding-window limiter. On serverless each instance has its own memory, so this is a speed bump
 * against accidental double-submits and trivial abuse, not a security boundary: the real guards are Odoo-side
 * validation, the idempotency key, and the live availability check.
 */
const hits = new Map<string, number[]>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every(t => now - t >= windowMs)) hits.delete(k)
  return true
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}
