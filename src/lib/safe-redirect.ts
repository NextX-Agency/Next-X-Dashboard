/**
 * Post-sign-in redirect hardening.
 *
 * `?next=` ends up in `router.replace()` (login form) and `new URL(next, origin)` (auth callback).
 * A bare `startsWith('/') && !startsWith('//')` check is not enough: WHATWG URL parsing treats a
 * backslash like a slash for http(s), and strips tab, CR and LF anywhere in the input. So
 * `/\evil.example`, `/\t/evil.example` and `/%09/..` style values all resolve to another origin.
 * That turns a genuine NextX sign-in link into a phishing redirect.
 *
 * The rule here: the value must be a plain same-origin path (and optional query/fragment) that
 * survives a round trip through the URL parser unchanged in origin. Anything else falls back.
 */

export const DEFAULT_AFTER_SIGN_IN = '/dashboard';

/** Routes that must never be a sign-in destination (would loop or leak the flow). */
const NEVER = new Set(['/login']);

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns a same-origin path that is safe to redirect to, or `fallback`.
 * Never returns an absolute URL, a protocol-relative URL or a value containing a backslash or
 * control character.
 */
export function safeNextPath(
  requested: string | null | undefined,
  fallback: string = DEFAULT_AFTER_SIGN_IN,
): string {
  if (!requested) return fallback;
  if (requested.length > 512) return fallback;
  if (!requested.startsWith('/') || requested.startsWith('//')) return fallback;
  if (CONTROL_OR_BACKSLASH.test(requested)) return fallback;
  // Also reject the percent-encoded forms of the same characters at the start of the path.
  if (/^\/(%2f|%5c|%09|%0a|%0d)/i.test(requested)) return fallback;

  try {
    // A fixed, unroutable base: if parsing moves the origin, the input was not a plain path.
    const base = 'https://nextx.invalid';
    const url = new URL(requested, base);
    if (url.origin !== base) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Dot-segments collapse during parsing: `/.//evil.example` normalises to `//evil.example`, which a
    // browser then reads as another origin. Re-check the normalised result, not just the input.
    if (path.startsWith('//') || path.startsWith('/' + '\\')) return fallback;
    if (new URL(path, base).origin !== base) return fallback;
    const normalised = url.pathname.replace(/\/+$/, '').toLowerCase();
    if (NEVER.has(normalised)) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
