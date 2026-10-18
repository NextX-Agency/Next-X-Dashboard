'use client';

import Image, { type ImageProps } from 'next/image';
import { type ReactNode, useState } from 'react';

/**
 * A product photograph that degrades gracefully: if the file cannot be loaded (a missing or moved
 * storage object, a bad address) the fallback is shown instead of a broken-image icon with alt text
 * spilling out of the frame.
 */
export function SafeImage({ fallback, ...props }: ImageProps & { fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <Image {...props} onError={() => setFailed(true)} />;
}
