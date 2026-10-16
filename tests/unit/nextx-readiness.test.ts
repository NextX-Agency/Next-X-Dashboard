import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditLegacyMediaSources,
  collectLegacyMediaUrls,
  prepareLegacyMedia,
} from '../../scripts/migrate-nextx/media';
import {
  assertMediaPreparationReport,
  assertReadinessReport,
  MEDIA_PREPARATION_REQUIRED_GATES,
  REQUIRED_READINESS_GATES,
} from '../../scripts/migrate-nextx/readiness';

function passingReport(fingerprint = 'a'.repeat(64)) {
  return {
    generatedAt: '2026-09-23T12:00:00.000Z',
    workingTreeFingerprint: fingerprint,
    gates: Object.fromEntries(REQUIRED_READINESS_GATES.map((gate) => [gate, 'PASS'])),
  };
}

function mediaPreparationReport(
  fingerprint = 'a'.repeat(64),
  stagingHost = 'storage.staging.example.test',
) {
  return {
    phase: 'MEDIA_PREPARATION',
    generatedAt: '2026-09-23T12:00:00.000Z',
    workingTreeFingerprint: fingerprint,
    targetEnvironment: 'staging',
    stagingHost,
    storageSmokeTest: 'PASS',
    gates: Object.fromEntries(MEDIA_PREPARATION_REQUIRED_GATES.map((gate) => [gate, 'PASS'])),
  };
}

describe('NextX readiness report guard', () => {
  it('accepts a current report only when every required gate passes', () => {
    expect(assertReadinessReport(passingReport(), 'a'.repeat(64)).workingTreeFingerprint).toBe(
      'a'.repeat(64),
    );
  });

  it('refuses final migration writes when any gate is incomplete', () => {
    const report = passingReport();
    report.gates.MEDIA = 'PENDING';
    expect(() => assertReadinessReport(report, 'a'.repeat(64))).toThrow(/MEDIA/);
  });

  it('refuses stale reports after the working tree changes', () => {
    expect(() => assertReadinessReport(passingReport(), 'b'.repeat(64))).toThrow(
      /current working tree/,
    );
  });
});

describe('NextX staging media preparation report guard', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('allows media preparation after staging prerequisites pass before import reconciliation', () => {
    const report = mediaPreparationReport() as ReturnType<typeof mediaPreparationReport> & {
      gates: Record<string, string>;
    };
    report.gates.MEDIA = 'PENDING';
    report.gates.MIGRATION_DRY_RUN = 'PENDING';
    report.gates.RECONCILIATION = 'PENDING';

    expect(
      assertMediaPreparationReport(report, 'a'.repeat(64), 'storage.staging.example.test')
        .phase,
    ).toBe('MEDIA_PREPARATION');
  });

  it('rejects a report without the Storage smoke test or an infrastructure prerequisite', () => {
    const noSmoke = { ...mediaPreparationReport(), storageSmokeTest: 'PENDING' };
    expect(() =>
      assertMediaPreparationReport(noSmoke, 'a'.repeat(64), noSmoke.stagingHost),
    ).toThrow(/Storage smoke test/);

    const base = mediaPreparationReport();
    const noRls = { ...base, gates: { ...base.gates, RLS: 'PENDING' } };
    expect(() =>
      assertMediaPreparationReport(noRls, 'a'.repeat(64), noRls.stagingHost),
    ).toThrow(/RLS/);
  });

  it('rejects reports for stale code or a different staging host', () => {
    const report = mediaPreparationReport();
    expect(() =>
      assertMediaPreparationReport(report, 'b'.repeat(64), report.stagingHost),
    ).toThrow(/current working tree/);
    expect(() =>
      assertMediaPreparationReport(report, 'a'.repeat(64), 'other.staging.example.test'),
    ).toThrow(/NEXTX_STAGING_HOST/);
  });

  it('stops before source downloads or Storage writes when its staging report is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.staging.example.test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-only-test-secret');
    vi.stubEnv('NEXTX_STAGING_HOST', 'storage.staging.example.test');

    await expect(
      prepareLegacyMedia(
        { items: [{ imageUrl: 'https://fixture.public.blob.vercel-storage.com/image.webp' }] },
        'migration-reports/unused-media-map.json',
        'staging',
        'staging',
        undefined,
      ),
    ).rejects.toThrow(/media-preparation-report/);
  });

  it('rejects a Supabase Cloud endpoint before accepting the report', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-only-test-secret');
    vi.stubEnv('NEXTX_STAGING_HOST', 'project.supabase.co');

    await expect(
      prepareLegacyMedia(
        {},
        'migration-reports/unused-media-map.json',
        'staging',
        'staging',
        undefined,
      ),
    ).rejects.toThrow(/Supabase Cloud/);
  });
});

describe('NextX read-only media preflight', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('collects unique product and brand image URLs without exposing row values', () => {
    const urls = collectLegacyMediaUrls({
      items: [
        { imageUrl: 'https://one.public.blob.vercel-storage.com/item.webp' },
        { image_url: 'https://two.public.blob.vercel-storage.com/item.webp' },
        { photoUrl: 'https://one.public.blob.vercel-storage.com/item.webp' },
      ],
      storeSettings: [
        {
          key: 'store_logo',
          value: { src: 'https://logo.public.blob.vercel-storage.com/logo.png' },
        },
      ],
    });

    expect(urls).toEqual([
      'https://logo.public.blob.vercel-storage.com/logo.png',
      'https://one.public.blob.vercel-storage.com/item.webp',
      'https://two.public.blob.vercel-storage.com/item.webp',
    ]);
  });

  it('downloads and decodes approved images in memory without writing to Storage', async () => {
    const imageBytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const fetchMock = vi.fn(async () => new Response(imageBytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await auditLegacyMediaSources({
      items: [{ imageUrl: 'https://fixture.public.blob.vercel-storage.com/image.png' }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      'Read-only media preflight: 1/1 public image URLs are valid.',
    );
    expect(log.mock.calls.flat().join(' ')).not.toContain(
      'fixture.public.blob.vercel-storage.com',
    );
  });

  it('rejects non-Vercel URLs before network access and redacts them from output', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(
      auditLegacyMediaSources({ items: [{ imageUrl: 'https://untrusted.example/image.png' }] }),
    ).rejects.toThrow(/no destination was written/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).not.toContain('untrusted.example');
  });
});
