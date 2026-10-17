import { describe, expect, it } from 'vitest';
import { GET, HEAD } from '../../src/app/watches/[[...path]]/route';

describe('retired watch URLs', () => {
  it('answer 410 Gone with a link back to the shop, not a redirect', async () => {
    const response = GET();
    const body = await response.text();

    expect(response.status).toBe(410);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(body).toContain('href="/shop"');
    expect(body).toContain('no longer sells watches');
  });

  it('answers HEAD requests with the same status and no body', async () => {
    const response = HEAD();

    expect(response.status).toBe(410);
    expect(await response.text()).toBe('');
  });
});
