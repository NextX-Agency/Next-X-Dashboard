import { describe, expect, it } from 'vitest';
import { safeNextPath } from '@/lib/safe-redirect';

describe('safeNextPath', () => {
  it('keeps plain same-origin paths, query and fragment', () => {
    expect(safeNextPath('/inventory')).toBe('/inventory');
    expect(safeNextPath('/sales?status=confirmed&page=2')).toBe(
      '/sales?status=confirmed&page=2',
    );
    expect(safeNextPath('/items/abc#photos')).toBe('/items/abc#photos');
  });

  it('falls back when nothing was asked for', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
    expect(safeNextPath('', '/somewhere')).toBe('/somewhere');
  });

  it('refuses absolute and protocol-relative URLs', () => {
    for (const value of [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '//evil.example/path',
      'javascript:alert(1)',
      'evil.example',
      'dashboard',
    ]) {
      expect(safeNextPath(value), value).toBe('/dashboard');
    }
  });

  it('refuses the backslash and control-character tricks that a naive startsWith check lets through', () => {
    for (const value of [
      '/\\evil.example',
      '/\\/evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/%09/evil.example',
      '/%2f/evil.example',
      '/%5cevil.example',
      '/ok\\..\\evil',
      '/path\u0000',
    ]) {
      expect(safeNextPath(value), JSON.stringify(value)).toBe('/dashboard');
    }
  });

  it('refuses dot-segment tricks that normalise into a protocol-relative URL', () => {
    for (const value of [
      '/a/..//evil.example',
      '/.//evil.example',
      '/%2e//evil.example',
      '/..//evil.example',
      '/x/..//evil.example/y',
    ]) {
      const result = safeNextPath(value);
      expect(result, value).toBe('/dashboard');
      expect(new URL(result, 'https://nextx.example').origin, value).toBe(
        'https://nextx.example',
      );
    }
  });

  it('treats a trailing slash or capitals on the sign-in page as the sign-in page', () => {
    expect(safeNextPath('/login/')).toBe('/dashboard');
    expect(safeNextPath('/LOGIN')).toBe('/dashboard');
  });

  it('never redirects back to the sign-in form and caps absurd lengths', () => {
    expect(safeNextPath('/login')).toBe('/dashboard');
    expect(safeNextPath('/login?next=/x')).toBe('/dashboard');
    expect(safeNextPath(`/${'a'.repeat(600)}`)).toBe('/dashboard');
  });

  it('always returns a path that resolves on the same origin', () => {
    const hostile = ['/\\evil.example', '//evil.example', '/%2f/x', '/ok', '/a?b=c', 'x:y'];
    for (const value of hostile) {
      const result = safeNextPath(value);
      expect(new URL(result, 'https://nextx.example').origin, value).toBe(
        'https://nextx.example',
      );
    }
  });
});
