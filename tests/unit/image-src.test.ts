import { describe, expect, it } from 'vitest';
import { isPrivateHost, productInitials, resolveImageSource } from '@/lib/image-src';

const SUPABASE = 'https://db.nextx.example';
const BUCKET = `${SUPABASE}/storage/v1/object/public/nextly-product-images`;

describe('resolveImageSource', () => {
  it('optimises the configured public bucket', () => {
    expect(resolveImageSource(`${BUCKET}/products/a/b-400.webp`, SUPABASE)).toEqual({
      src: `${BUCKET}/products/a/b-400.webp`,
      optimize: true,
    });
  });
  it('optimises files served from the site itself (the dev fixtures)', () => {
    expect(resolveImageSource('/dev-fixtures/live/kz.jpg', SUPABASE)).toEqual({
      src: '/dev-fixtures/live/kz.jpg',
      optimize: true,
    });
  });
  it('shows an address the optimiser may not fetch directly instead of breaking', () => {
    expect(resolveImageSource('https://old-host.example/p.jpg', SUPABASE)).toEqual({
      src: 'https://old-host.example/p.jpg',
      optimize: false,
    });
    // Another bucket on the same host is not allowed by the image configuration either.
    expect(
      resolveImageSource(`${SUPABASE}/storage/v1/object/public/other/x.jpg`, SUPABASE)
        ?.optimize,
    ).toBe(false);
  });
  it('never optimises a private or loopback host (the optimiser refuses to fetch it)', () => {
    const local = 'http://127.0.0.1:54321';
    expect(
      resolveImageSource(
        `${local}/storage/v1/object/public/nextly-product-images/a.webp`,
        local,
      )?.optimize,
    ).toBe(false);
  });
  it('has no source for nothing usable', () => {
    expect(resolveImageSource(null, SUPABASE)).toBeNull();
    expect(resolveImageSource('', SUPABASE)).toBeNull();
    expect(resolveImageSource('   ', SUPABASE)).toBeNull();
    expect(resolveImageSource('//evil.example/x.jpg', SUPABASE)).toBeNull();
    expect(resolveImageSource('javascript:alert(1)', SUPABASE)).toBeNull();
    expect(resolveImageSource('not a url', SUPABASE)).toBeNull();
  });
  it('works when no Supabase address is configured', () => {
    expect(resolveImageSource(`${BUCKET}/a.webp`, undefined)?.optimize).toBe(false);
  });
});

describe('isPrivateHost', () => {
  it('recognises loopback and private ranges only', () => {
    for (const host of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.4',
      '172.20.1.1',
      '169.254.1.1',
      '::1',
      'shop.localhost',
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
    for (const host of ['db.nextx.example', '8.8.8.8', '172.32.0.1', 'fcdn.example.com']) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });
});

describe('productInitials', () => {
  it('takes two letters from a name', () => {
    expect(productInitials('KZ AS16 Pro X')).toBe('KA');
    expect(productInitials('Essager')).toBe('ES');
    expect(productInitials('  m-vave sws12 ')).toBe('MV');
    expect(productInitials('')).toBe('?');
    expect(productInitials(null)).toBe('?');
  });
});
