import { describe, expect, it } from 'vitest';
import {
  fitWithin,
  formatBytes,
  MAX_DIMENSION,
  planCompression,
  SKIP_UNDER_BYTES,
} from '@/lib/image-compress';

describe('fitWithin', () => {
  it('leaves a picture inside the limit alone', () => {
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200, resized: false });
    expect(fitWithin(MAX_DIMENSION, 10)).toMatchObject({ resized: false });
  });
  it('scales the longest side down to 2000 and keeps the proportions', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500, resized: true });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000, resized: true });
    expect(fitWithin(6000, 1)).toEqual({ width: 2000, height: 1, resized: true });
  });
  it('copes with a custom limit and with nonsense', () => {
    expect(fitWithin(1000, 500, 500)).toEqual({ width: 500, height: 250, resized: true });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0, resized: false });
  });
});

describe('planCompression', () => {
  it('keeps a small photograph that already fits', () => {
    expect(
      planCompression({ bytes: 400_000, type: 'image/jpeg', width: 1200, height: 900 }),
    ).toEqual({
      action: 'keep',
      reason: 'small',
    });
  });
  it('shrinks a heavy camera photograph', () => {
    expect(
      planCompression({ bytes: 5_000_000, type: 'image/jpeg', width: 4032, height: 3024 }),
    ).toEqual({ action: 'compress', width: 2000, height: 1500, resized: true });
  });
  it('re-encodes a heavy file that is already small in pixels, without resizing', () => {
    expect(
      planCompression({
        bytes: SKIP_UNDER_BYTES + 1,
        type: 'image/png',
        width: 1500,
        height: 1500,
      }),
    ).toEqual({ action: 'compress', width: 1500, height: 1500, resized: false });
  });
  it('resizes an oversized picture even when its file is small', () => {
    expect(
      planCompression({ bytes: 100_000, type: 'image/webp', width: 5000, height: 100 }),
    ).toMatchObject({ action: 'compress', resized: true });
  });
  it('leaves other file types to the server to refuse', () => {
    expect(
      planCompression({ bytes: 9_000_000, type: 'image/heic', width: 4000, height: 3000 }),
    ).toEqual({
      action: 'keep',
      reason: 'unsupported-type',
    });
  });
});

describe('formatBytes', () => {
  it('writes KB and MB', () => {
    expect(formatBytes(310_000)).toBe('310 KB');
    expect(formatBytes(4_200_000)).toBe('4.2 MB');
    expect(formatBytes(10)).toBe('1 KB');
  });
});
