/**
 * One image-resolution policy for every surface that shows a product: the shop, the product page,
 * the cart, the sale picker, sale lines and the product screens.
 *
 * It uses the canonical `product_images` rows and nothing else. `variantId` pins a photograph to one
 * option (a colourway); `isPrimary` marks the product's representative photograph (one per product);
 * `position` is the owner's order. There is no second image system and nothing here invents an image.
 *
 * For an explicitly chosen variant, in order:
 *   1. the variant's own photograph that sorts first (its designated primary),
 *   2. otherwise a shared photograph (not pinned to any option), primary first,
 *   3. otherwise the product's primary photograph, but only when the product has a single option, so
 *      the "Silver" page can never show the "Black" photograph,
 *   4. otherwise nothing: the caller shows the neutral placeholder.
 *
 * A product with several options and no chosen variant uses the owner-configured representative:
 * the primary photograph, else the first shared one, else the first one.
 */

export type ResolvableImage = {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  blurDataUrl: string | null;
  /** The small derivative, when one exists. Cards and selectors prefer it. */
  thumbUrl?: string | null;
  variantId: string | null;
  isPrimary: boolean;
  position: number;
};

export type ImageSource = 'variant' | 'shared' | 'product-primary' | 'placeholder';

const byOrder = <T extends ResolvableImage>(a: T, b: T) =>
  Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position;

/** The owner's order within one scope, without letting `isPrimary` jump the queue. */
const byPosition = <T extends ResolvableImage>(a: T, b: T) => a.position - b.position;

/** The product's representative photograph: owner-flagged primary, else first shared, else first. */
export function representativeImage<T extends ResolvableImage>(images: readonly T[]): T | null {
  if (images.length === 0) return null;
  const primary = images.find((image) => image.isPrimary);
  if (primary) return primary;
  const sorted = [...images].sort(byPosition);
  return sorted.find((image) => image.variantId === null) ?? sorted[0] ?? null;
}

/** Photographs belonging to the variant, in the owner's order. The first is its designated primary. */
export function ownImages<T extends ResolvableImage>(
  images: readonly T[],
  variantId: string,
): T[] {
  return images.filter((image) => image.variantId === variantId).sort(byPosition);
}

/** Photographs not pinned to any option, primary first. */
export function sharedImages<T extends ResolvableImage>(images: readonly T[]): T[] {
  return images.filter((image) => image.variantId === null).sort(byOrder);
}

/**
 * The photographs to browse while `variantId` is selected: its own first, then the shared ones
 * (box contents, lifestyle). Photographs pinned to other options are never included.
 */
export function galleryImages<T extends ResolvableImage>(
  images: readonly T[],
  variantId: string | null,
  variantCount: number,
): T[] {
  if (!variantId) {
    return variantCount > 1
      ? [...images].sort(byOrder).filter((image) => image.variantId === null || image.isPrimary)
      : [...images].sort(byOrder);
  }
  const own = ownImages(images, variantId);
  const shared = sharedImages(images);
  if (own.length > 0 || shared.length > 0) return [...own, ...shared];
  // A single-option product has no "other colour" to confuse it with.
  return variantCount <= 1 ? [...images].sort(byOrder) : [];
}

export function resolveVariantImage<T extends ResolvableImage>(
  images: readonly T[],
  variantId: string | null,
  variantCount: number,
): { image: T | null; source: ImageSource } {
  if (variantId) {
    const own = ownImages(images, variantId)[0];
    if (own) return { image: own, source: 'variant' };
    const shared = sharedImages(images)[0];
    if (shared) return { image: shared, source: 'shared' };
    const primary = images.find((image) => image.isPrimary);
    if (primary && variantCount <= 1) return { image: primary, source: 'product-primary' };
    return { image: null, source: 'placeholder' };
  }
  const image = representativeImage(images);
  return image
    ? { image, source: image.isPrimary ? 'product-primary' : 'shared' }
    : { image: null, source: 'placeholder' };
}

/** The URL to use at card, selector or thumbnail sizes. */
export function thumbSrc(
  image: Pick<ResolvableImage, 'url' | 'thumbUrl'> | null,
): string | null {
  return image ? (image.thumbUrl ?? image.url) : null;
}
