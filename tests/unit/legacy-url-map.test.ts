import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import { LEGACY_AUDIO_REDIRECTS, LEGACY_RETIRED_WATCH_IDS } from '../../src/lib/legacy-url-map';

describe('legacy shop URL map', () => {
  it('derives every audio slug suffix from SHA-256 of the legacy id', () => {
    for (const [id, slug] of LEGACY_AUDIO_REDIRECTS) {
      const suffix = createHash('sha256').update(id).digest('hex').slice(0, 6);
      expect(slug.endsWith(`-${suffix}`), slug).toBe(true);
    }
  });

  it('keeps audio ids and retired watch ids disjoint and unique', () => {
    const audio = LEGACY_AUDIO_REDIRECTS.map(([id]) => id);
    expect(new Set(audio).size).toBe(audio.length);
    expect(new Set(LEGACY_RETIRED_WATCH_IDS).size).toBe(LEGACY_RETIRED_WATCH_IDS.length);
    expect(audio.filter((id) => LEGACY_RETIRED_WATCH_IDS.includes(id))).toEqual([]);
  });

  it('redirects each legacy audio URL permanently in a single hop', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const [id, slug] of LEGACY_AUDIO_REDIRECTS) {
      for (const root of ['catalog', 'audio']) {
        expect(redirects).toContainEqual({
          source: `/${root}/${id}`,
          destination: `/audio/${slug}`,
          permanent: true,
        });
      }
    }
  });

  it('answers retired watch ids with the 410 route and never redirects them', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const rewrites = await nextConfig.rewrites?.();
    const before = Array.isArray(rewrites) ? [] : (rewrites?.beforeFiles ?? []);
    for (const id of LEGACY_RETIRED_WATCH_IDS) {
      expect(before).toContainEqual({
        source: `/catalog/${id}`,
        destination: '/watches/retired',
      });
      expect(redirects.some((rule) => rule.source === `/catalog/${id}`)).toBe(false);
    }
    const generic = redirects.find((rule) => rule.source.startsWith('/catalog/:legacyItemId'));
    expect(generic).toBeDefined();
    for (const id of LEGACY_RETIRED_WATCH_IDS) expect(generic?.source).toContain(id);
  });
});
