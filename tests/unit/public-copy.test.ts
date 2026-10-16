import { describe, expect, it } from 'vitest';
import { cleanPublicCopy } from '@/lib/public-copy';

const OBJECT_REPLACEMENT = String.fromCharCode(0xfffc);

describe('cleanPublicCopy', () => {
  it('removes object-replacement characters and the whitespace they leave behind', () => {
    const legacy = `Rijk geluid.  ${OBJECT_REPLACEMENT}\n\n\n\nAfneembare kabel.  ${OBJECT_REPLACEMENT}`;

    expect(cleanPublicCopy(legacy)).toBe('Rijk geluid.\n\nAfneembare kabel.');
  });

  it('returns null for missing or empty copy', () => {
    expect(cleanPublicCopy(null)).toBeNull();
    expect(cleanPublicCopy(undefined)).toBeNull();
    expect(cleanPublicCopy(`  ${OBJECT_REPLACEMENT} \n`)).toBeNull();
  });

  it('leaves clean copy unchanged', () => {
    expect(cleanPublicCopy('Betaalbare in-ear monitor.')).toBe('Betaalbare in-ear monitor.');
  });
});
