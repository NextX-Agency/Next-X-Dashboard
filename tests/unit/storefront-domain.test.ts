import { describe, expect, it } from 'vitest';
import {
  isStorefrontDomain,
  normalizeStorefrontDomain,
  storefrontPagePath,
  storefrontProductPath,
  storefrontPublicOrigin,
} from '@/lib/storefront-domain';

describe('storefront domain resolution', () => {
  it('normalizes domains from admin input and request hosts', () => {
    expect(normalizeStorefrontDomain('https://WWW.Shop.Example.com:443/path')).toBe(
      'shop.example.com',
    );
    expect(normalizeStorefrontDomain('shop.example.com.')).toBe('shop.example.com');
    expect(normalizeStorefrontDomain('')).toBeNull();
  });

  it('accepts hostnames but rejects URLs and malformed labels', () => {
    expect(isStorefrontDomain('shop.example.com')).toBe(true);
    expect(isStorefrontDomain('localhost')).toBe(false);
    expect(isStorefrontDomain('shop..example.com')).toBe(false);
  });

  it('uses one category-neutral URL structure for every storefront', () => {
    expect(storefrontProductPath('audio', 'earbuds')).toBe('/products/earbuds');
    expect(storefrontProductPath('main', 'camera')).toBe('/products/camera');
    expect(storefrontProductPath(null, 'a b')).toBe('/products/a%20b');
    expect(storefrontPagePath('audio')).toBe('/shop');
    expect(storefrontPagePath('main')).toBe('/shop');
    expect(storefrontPagePath('audio', 'cart')).toBe('/cart');
    expect(storefrontPagePath('main', 'setups/starter')).toBe('/setups/starter');
  });

  it('keeps staging canonicals on staging and validates production custom domains', () => {
    expect(
      storefrontPublicOrigin('shop.example.com', 'https://staging.example.com', true),
    ).toBe('https://staging.example.com');
    expect(
      storefrontPublicOrigin(
        'https://WWW.Shop.Example.com/path',
        'https://app.example.com',
        false,
      ),
    ).toBe('https://shop.example.com');
    expect(storefrontPublicOrigin('invalid domain', 'https://app.example.com', false)).toBe(
      'https://app.example.com',
    );
  });
});
