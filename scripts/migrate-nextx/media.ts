import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { normalizeSnapshot, rowString, rowValue, type LegacyRow } from './types';
import { assertMediaPreparationReport, workingTreeFingerprint } from './readiness';

export const LEGACY_MEDIA_MAP_VERSION = 1;
export const LEGACY_MEDIA_BUCKET = 'nextly-product-images';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);
const SAFE_SOURCE_SUFFIX = '.public.blob.vercel-storage.com';

export type MigratedMediaAsset = {
  publicUrl: string;
  blobPathname: string;
  thumbUrl: string;
  thumbPathname: string;
  width: number;
  height: number;
  byteSize: number;
  blurDataUrl: string;
};

export type LegacyMediaMap = {
  version: typeof LEGACY_MEDIA_MAP_VERSION;
  assets: Record<string, MigratedMediaAsset>;
};

function mediaUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const candidate = value.trim();
    return /^https?:\/\//i.test(candidate) ? candidate : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = mediaUrl(item);
      if (nested) return nested;
    }
  }
  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (/^(url|src|image|imageurl|image_url)$/i.test(key)) {
        const nested = mediaUrl(nestedValue);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export function collectLegacyMediaUrls(raw: unknown): string[] {
  const snapshot = normalizeSnapshot(raw);
  const urls = new Set<string>();
  for (const row of snapshot.items) {
    const candidate = mediaUrl(first(row, 'imageUrl', 'image_url', 'image', 'photoUrl', 'photo_url'));
    if (candidate) urls.add(candidate);
  }
  for (const row of snapshot.storeSettings) {
    const key = rowString(row, 'key') ?? '';
    if (!/(logo|hero|image|banner)/i.test(key)) continue;
    const candidate = mediaUrl(rowValue(row, 'value'));
    if (candidate) urls.add(candidate);
  }
  return [...urls].sort();
}

function first(row: LegacyRow, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function validateSourceUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('A legacy image URL is malformed; media copying stopped before writing the map.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.toLowerCase().endsWith(SAFE_SOURCE_SUFFIX)
  ) {
    throw new Error('A legacy image is outside the verified public Blob host; media copying stopped.');
  }
  return url;
}

async function readLimited(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('The legacy image response had no body.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    const chunk = Buffer.from(result.value);
    total += chunk.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error('A legacy image exceeds the 10 MB migration limit.');
    }
    chunks.push(chunk);
  }
  if (total === 0) throw new Error('The legacy image response was empty.');
  return Buffer.concat(chunks, total);
}

async function downloadLegacyImage(source: string): Promise<Buffer> {
  let url = validateSourceUrl(source);
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || attempt === 3) throw new Error('A legacy image redirect could not be followed safely.');
      url = validateSourceUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`A legacy image request failed with status ${response.status}.`);
    return readLimited(response);
  }
  throw new Error('A legacy image redirect limit was exceeded.');
}

async function validateLegacyImage(sourceUrl: string): Promise<void> {
  const source = await downloadLegacyImage(sourceUrl);
  const image = sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
    throw new Error('A legacy image has an unsupported or invalid image format.');
  }
  await image.clone().rotate().resize({ width: 1, height: 1, fit: 'inside' }).toBuffer();
}

/** Read-only source/CDN preflight. It never writes to Storage or persists image bytes. */
export async function auditLegacyMediaSources(raw: unknown): Promise<void> {
  const urls = collectLegacyMediaUrls(raw);
  if (urls.length === 0) throw new Error('The source export contains no remote legacy media URLs.');

  const failures = new Map<string, number>();
  let nextIndex = 0;
  let passed = 0;
  const worker = async () => {
    while (nextIndex < urls.length) {
      const current = nextIndex++;
      const sourceUrl = urls[current];
      if (!sourceUrl) continue;
      try {
        await validateLegacyImage(sourceUrl);
        passed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown media error';
        const safeMessage = message.replace(/https?:\/\/\S+/gi, '[URL redacted]');
        failures.set(safeMessage, (failures.get(safeMessage) ?? 0) + 1);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, () => worker()));

  console.log(`Read-only media preflight: ${passed}/${urls.length} public image URLs are valid.`);
  for (const [message, count] of [...failures].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${count} asset(s): ${message}`);
  }
  if (failures.size > 0) {
    const failed = urls.length - passed;
    throw new Error(`Media preflight failed for ${failed} asset(s); no destination was written.`);
  }
  console.log('No source, database or Storage writes were performed.');
}

async function prepareOne(
  sourceUrl: string,
  storage: ReturnType<typeof createClient>['storage'],
): Promise<MigratedMediaAsset> {
  const source = await downloadLegacyImage(sourceUrl);
  const image = sharp(source, { limitInputPixels: 40_000_000, failOn: 'error' });
  const metadata = await image.metadata();
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format) || !metadata.width || !metadata.height) {
    throw new Error('A legacy image has an unsupported or invalid image format.');
  }

  const [{ data: display, info }, thumb, blur] = await Promise.all([
    image.clone().rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .avif({ quality: 75 }).toBuffer({ resolveWithObject: true }),
    image.clone().rotate().resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 }).toBuffer(),
    image.clone().rotate().resize({ width: 18, height: 18, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 40 }).toBuffer(),
  ]);
  const hash = createHash('sha256').update(sourceUrl).digest('hex');
  const blobPathname = `legacy/${hash}/1600.avif`;
  const thumbPathname = `legacy/${hash}/400.webp`;
  const uploads = await Promise.all([
    storage.from(LEGACY_MEDIA_BUCKET).upload(blobPathname, display, {
      contentType: 'image/avif', cacheControl: '31536000', upsert: true,
    }),
    storage.from(LEGACY_MEDIA_BUCKET).upload(thumbPathname, thumb, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: true,
    }),
  ]);
  if (uploads.some(({ error }) => error)) {
    throw new Error('The self-hosted Storage upload failed; no media map was written.');
  }
  const publicUrl = storage.from(LEGACY_MEDIA_BUCKET).getPublicUrl(blobPathname).data.publicUrl;
  const thumbUrl = storage.from(LEGACY_MEDIA_BUCKET).getPublicUrl(thumbPathname).data.publicUrl;
  return {
    publicUrl,
    blobPathname,
    thumbUrl,
    thumbPathname,
    width: info.width,
    height: info.height,
    byteSize: display.byteLength,
    blurDataUrl: `data:image/jpeg;base64,${blur.toString('base64')}`,
  };
}

export async function prepareLegacyMedia(
  raw: unknown,
  outputPath: string,
  targetEnvironment: string | undefined,
  safeTargetConfirmation: string | undefined,
  mediaPreparationReportPath: string | undefined,
): Promise<number> {
  if (targetEnvironment !== 'staging' || safeTargetConfirmation !== 'staging') {
    throw new Error('Media writes require --target-environment staging --confirm-safe-target staging.');
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const stagingHost = process.env.NEXTX_STAGING_HOST?.trim().toLowerCase();
  if (!supabaseUrl || !secret) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY for the isolated self-hosted Storage target.');
  }
  const target = new URL(supabaseUrl);
  if (!stagingHost || target.hostname.toLowerCase() !== stagingHost) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must match the explicitly configured NEXTX_STAGING_HOST.');
  }
  if (target.protocol !== 'https:') {
    throw new Error('The staging Storage endpoint must use HTTPS.');
  }
  if (target.hostname.toLowerCase().endsWith('supabase.co')) {
    throw new Error('Legacy media cannot be copied to Supabase Cloud; use the private self-hosted target.');
  }
  if (!mediaPreparationReportPath) {
    throw new Error('Media writes require --media-preparation-report with staging prerequisites and a passing Storage smoke test.');
  }
  const { fingerprint } = await workingTreeFingerprint();
  const mediaPreparationReport = JSON.parse(await readFile(resolve(mediaPreparationReportPath), 'utf8')) as unknown;
  assertMediaPreparationReport(mediaPreparationReport, fingerprint, stagingHost);
  const urls = collectLegacyMediaUrls(raw);
  if (urls.length === 0) throw new Error('The source export contains no remote legacy media URLs.');

  const storage = createClient(supabaseUrl, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).storage;
  const entries: Array<[string, MigratedMediaAsset]> = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < urls.length) {
      const current = nextIndex++;
      const sourceUrl = urls[current];
      if (!sourceUrl) continue;
      try {
        entries[current] = [sourceUrl, await prepareOne(sourceUrl, storage)];
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown media error';
        throw new Error(`Media copy stopped at asset ${current + 1}/${urls.length}: ${message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, () => worker()));

  const report: LegacyMediaMap = {
    version: LEGACY_MEDIA_MAP_VERSION,
    assets: Object.fromEntries(entries),
  };
  const absoluteOutputPath = resolve(outputPath);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Copied ${entries.length} legacy assets into self-hosted Storage.`);
  console.log(`Media map written: ${absoluteOutputPath}`);
  return entries.length;
}
