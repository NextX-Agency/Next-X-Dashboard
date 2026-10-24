/**
 * Shrinking a photograph in the browser before it is uploaded.
 *
 * A phone camera produces 3 to 8 MB files of 12 megapixels. The server only keeps a 1600 px display
 * copy and a 400 px thumbnail anyway, so sending the original over mobile data is wasted time and the
 * 10 MB limit is easy to hit. Photographs are redrawn on a canvas no larger than 2000 px on the
 * longest side and saved as WebP (JPEG where WebP cannot be written). The server still validates the
 * real bytes; this only saves time. If anything about it fails, the original goes up unchanged.
 *
 * `fitWithin` and `planCompression` are pure and unit tested; `compressImage` needs a browser.
 */

export const MAX_DIMENSION = 2000;
/** The server's limit (src/server/services/media.ts). */
export const SERVER_MAX_BYTES = 10 * 1024 * 1024;
/** Files at or under this size, already inside the dimension limit, are left alone. */
export const SKIP_UNDER_BYTES = 1_200_000;
export const OUTPUT_QUALITY = 0.86;

export function fitWithin(
  width: number,
  height: number,
  max = MAX_DIMENSION,
): { width: number; height: number; resized: boolean } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, resized: false };
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height, resized: false };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

export type CompressionPlan =
  | { action: 'keep'; reason: 'small' | 'unsupported-type' }
  | { action: 'compress'; width: number; height: number; resized: boolean };

/** Decide, from the file's size, type and pixel size, whether to redraw it. */
export function planCompression(input: {
  bytes: number;
  type: string;
  width: number;
  height: number;
}): CompressionPlan {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(input.type)) {
    return { action: 'keep', reason: 'unsupported-type' };
  }
  const fit = fitWithin(input.width, input.height);
  if (!fit.resized && input.bytes <= SKIP_UNDER_BYTES)
    return { action: 'keep', reason: 'small' };
  return { action: 'compress', width: fit.width, height: fit.height, resized: fit.resized };
}

export type CompressionResult = {
  file: File;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
};

function renameFor(file: File, type: string): string {
  const stem = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return `${stem}.${type === 'image/webp' ? 'webp' : 'jpg'}`;
}

async function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, OUTPUT_QUALITY));
}

export async function compressImage(file: File): Promise<CompressionResult> {
  const untouched: CompressionResult = {
    file,
    originalBytes: file.size,
    finalBytes: file.size,
    compressed: false,
  };
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
      return untouched;
    }
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const plan = planCompression({
      bytes: file.size,
      type: file.type,
      width: bitmap.width,
      height: bitmap.height,
    });
    if (plan.action === 'keep') {
      bitmap.close();
      return untouched;
    }
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return untouched;
    }
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    bitmap.close();

    // Where WebP cannot be written the browser silently returns PNG; fall back to JPEG then.
    let blob = await toBlob(canvas, 'image/webp');
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg');
    if (!blob) return untouched;
    // Never make a file bigger unless it had to be resized to fit the limit.
    if (!plan.resized && blob.size >= file.size) return untouched;
    const output = new File([blob], renameFor(file, blob.type), {
      type: blob.type,
      lastModified: Date.now(),
    });
    return {
      file: output,
      originalBytes: file.size,
      finalBytes: output.size,
      compressed: true,
    };
  } catch {
    return untouched;
  }
}

/** "4.2 MB" / "380 KB" for a progress line. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}
