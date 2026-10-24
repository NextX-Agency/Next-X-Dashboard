/**
 * Which product photograph addresses can go through `next/image`'s optimiser, and how to label a
 * product that has no photograph.
 *
 * `next.config.ts` only allows ONE remote origin: the self-hosted Supabase Storage public bucket
 * `nextly-product-images`. Anything else handed to `next/image` is refused (an error in development,
 * an HTTP 400 from `/_next/image` in production), which shows up as a broken or empty thumbnail. The
 * optimiser also refuses to fetch from a loopback or private address, so a Supabase on 127.0.0.1 or
 * a LAN address cannot be optimised either. Rather than edit the config, the dashboard decides per
 * address: optimise what the config allows, show everything else straight from its own address (the
 * browser can reach a public photograph without our help), and fall back to a labelled placeholder
 * when even that fails. Pure, so it is unit tested.
 */

const PUBLIC_BUCKET_PATH = '/storage/v1/object/public/nextly-product-images/';

/** True for hosts the image optimiser will not fetch from (SSRF guard): loopback and private ranges. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    return true;
  if (host.includes(':')) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80')
    );
  }
  const octets = host.split('.').map(Number);
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a = 0, b = 0] = octets;
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
}

export type ImageSource = {
  /** The address to hand to the image element. */
  src: string;
  /** Whether `next/image` may optimise it. False means "show as is" (`unoptimized`). */
  optimize: boolean;
};

/**
 * Decide how to load a stored photograph address.
 *
 * - `/dev-fixtures/...` and other site-relative files: optimised (they live in `public/`).
 * - the configured Supabase public bucket: optimised, unless that host is private (local Supabase).
 * - anything else (legacy hosts, other buckets): loaded directly, never through the optimiser.
 * - empty or unusable values: `null`, so the caller draws the placeholder.
 */
export function resolveImageSource(
  url: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): ImageSource | null {
  const raw = url?.trim();
  if (!raw) return null;
  if (raw.startsWith('//')) return null;
  if (raw.startsWith('/')) return { src: raw, optimize: true };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  let allowedOrigin: string | null = null;
  try {
    allowedOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  } catch {
    allowedOrigin = null;
  }
  const optimize =
    allowedOrigin !== null &&
    parsed.origin === allowedOrigin &&
    parsed.pathname.startsWith(PUBLIC_BUCKET_PATH) &&
    !isPrivateHost(parsed.hostname);
  return { src: raw, optimize };
}

/** Up to two capital letters for a product with no photograph ("KZ AS16 Pro X" is "KA"). */
export function productInitials(name: string | null | undefined): string {
  const words = (name ?? '')
    .split(/[\s\-_/·.]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  const second = words[1] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}
