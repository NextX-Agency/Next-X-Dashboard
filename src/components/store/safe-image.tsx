'use client';

import Image, { type ImageProps } from 'next/image';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * A product photograph that degrades gracefully: if the file cannot be loaded (a missing or moved
 * storage object, a bad address) the fallback is shown instead of a broken-image icon with alt text
 * spilling out of the frame.
 *
 * It also fades a photograph in when it arrives late. Only a lazy image that has not finished loading
 * when it mounts is marked (`data-nx-pending`); the stylesheet hides a marked image only for visitors
 * who accept motion, and it comes back on load. Eager and priority images (the first row, the LCP) are
 * never touched, a cached image is never touched, and a visitor without JavaScript sees the plain
 * server-rendered image.
 */
export function SafeImage({
  fallback,
  className,
  onLoad,
  ...props
}: ImageProps & { fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <Image
      {...props}
      className={cn('nx-img', className)}
      ref={(image) => {
        if (image && image.loading === 'lazy' && !image.complete) {
          image.dataset.nxPending = '';
        }
      }}
      onLoad={(event) => {
        delete event.currentTarget.dataset.nxPending;
        onLoad?.(event);
      }}
      onError={() => setFailed(true)}
    />
  );
}
