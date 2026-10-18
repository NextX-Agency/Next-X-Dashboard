import { describe, expect, it } from 'vitest';
import {
  galleryImages,
  type ResolvableImage,
  representativeImage,
  resolveVariantImage,
  thumbSrc,
} from '@/lib/product-images';

const image = (url: string, patch: Partial<ResolvableImage> = {}): ResolvableImage => ({
  url,
  width: 800,
  height: 800,
  alt: null,
  blurDataUrl: null,
  variantId: null,
  isPrimary: false,
  position: 0,
  ...patch,
});

const BLACK = 'v-black';
const SILVER = 'v-silver';
const PURPLE = 'v-purple';

const kz = [
  image('shared-box.jpg', { position: 9 }),
  image('black-2.jpg', { variantId: BLACK, position: 2 }),
  image('black-1.jpg', { variantId: BLACK, position: 1 }),
  image('silver-1.jpg', { variantId: SILVER, position: 3 }),
  image('hero.jpg', { isPrimary: true, position: 0 }),
];

describe('resolveVariantImage', () => {
  it('prefers the variant’s own first photograph', () => {
    expect(resolveVariantImage(kz, BLACK, 3)).toMatchObject({
      source: 'variant',
      image: { url: 'black-1.jpg' },
    });
    expect(resolveVariantImage(kz, SILVER, 3).image?.url).toBe('silver-1.jpg');
  });

  it('falls back to a shared photograph, primary first, never to another colour', () => {
    const result = resolveVariantImage(kz, PURPLE, 3);
    expect(result.source).toBe('shared');
    expect(result.image?.url).toBe('hero.jpg');
  });

  it('shows the placeholder rather than a different colour when only pinned photos exist', () => {
    const pinned = [image('black.jpg', { variantId: BLACK, isPrimary: true })];
    expect(resolveVariantImage(pinned, SILVER, 2)).toEqual({
      image: null,
      source: 'placeholder',
    });
  });

  it('uses the primary photograph for a single-option product', () => {
    const only = [image('only.jpg', { variantId: BLACK, isPrimary: true })];
    expect(resolveVariantImage(only, BLACK, 1).image?.url).toBe('only.jpg');
    expect(resolveVariantImage(only, 'other', 1).source).toBe('product-primary');
  });

  it('returns the owner-configured representative when no variant is chosen', () => {
    expect(resolveVariantImage(kz, null, 3)).toMatchObject({
      source: 'product-primary',
      image: { url: 'hero.jpg' },
    });
  });

  it('has a placeholder for a product with no photographs', () => {
    expect(resolveVariantImage([], null, 1)).toEqual({ image: null, source: 'placeholder' });
    expect(resolveVariantImage([], BLACK, 1)).toEqual({ image: null, source: 'placeholder' });
  });
});

describe('galleryImages', () => {
  it('lists the variant’s photographs first, then shared ones, and nothing from other options', () => {
    expect(galleryImages(kz, BLACK, 3).map((entry) => entry.url)).toEqual([
      'black-1.jpg',
      'black-2.jpg',
      'hero.jpg',
      'shared-box.jpg',
    ]);
    expect(galleryImages(kz, SILVER, 3).map((entry) => entry.url)).toEqual([
      'silver-1.jpg',
      'hero.jpg',
      'shared-box.jpg',
    ]);
  });

  it('is empty for an option with no usable photograph in a multi-option product', () => {
    expect(galleryImages([image('black.jpg', { variantId: BLACK })], SILVER, 2)).toEqual([]);
  });

  it('shows everything for a single-option product', () => {
    expect(galleryImages([image('a.jpg', { variantId: BLACK })], BLACK, 1)).toHaveLength(1);
  });
});

describe('representativeImage', () => {
  it('uses the primary, else the first shared, else the first', () => {
    expect(representativeImage(kz)?.url).toBe('hero.jpg');
    expect(
      representativeImage([
        image('b.jpg', { variantId: BLACK, position: 0 }),
        image('s.jpg', { position: 4 }),
      ])?.url,
    ).toBe('s.jpg');
    expect(representativeImage([image('b.jpg', { variantId: BLACK })])?.url).toBe('b.jpg');
    expect(representativeImage([])).toBeNull();
  });
});

describe('thumbSrc', () => {
  it('prefers the small derivative', () => {
    expect(thumbSrc(image('big.jpg', { thumbUrl: 'small.jpg' }))).toBe('small.jpg');
    expect(thumbSrc(image('big.jpg'))).toBe('big.jpg');
    expect(thumbSrc(null)).toBeNull();
  });
});
