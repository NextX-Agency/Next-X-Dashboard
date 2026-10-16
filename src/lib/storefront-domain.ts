/** Normalize a hostname/domain without storing protocols, paths, ports or www. */
export function normalizeStorefrontDomain(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;
  const withoutProtocol = raw.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  const withoutPort = withoutProtocol.replace(/:\d+$/, '').replace(/\.$/, '');
  return withoutPort.replace(/^www\./, '') || null;
}

export function isStorefrontDomain(value: string): boolean {
  const normalized = normalizeStorefrontDomain(value);
  return Boolean(
    normalized &&
      normalized.length <= 253 &&
      /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized),
  );
}

/** Keep staging canonicals on the staging host even when copied store data has
 * production domains. A validated custom domain is used only in production. */
export function storefrontPublicOrigin(
  storefrontDomain: string | null | undefined,
  appOrigin: string,
  staging: boolean,
): string {
  const domain = normalizeStorefrontDomain(storefrontDomain);
  if (staging || !domain || !isStorefrontDomain(domain)) return appOrigin;
  return `https://${domain}`;
}

/** Keep product URLs on the matching legacy storefront path when possible. */
export function storefrontProductPath(
  storefrontSlug: string | null | undefined,
  productSlug: string,
): string {
  const root = storefrontSlug === 'audio' ? `/${storefrontSlug}` : '/p';
  return `${root}/${encodeURIComponent(productSlug)}`;
}

export function storefrontPagePath(
  storefrontSlug: string | null | undefined,
  path = '',
): string {
  const root = storefrontSlug === 'audio' ? `/${storefrontSlug}` : '';
  const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';
  return `${root}${suffix}` || '/';
}
