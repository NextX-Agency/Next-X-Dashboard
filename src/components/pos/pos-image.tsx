'use client';

import { Package } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { resolveImageSource } from '@/lib/image-src';
import type { PosImage } from '@/lib/pos/types';

/**
 * A product photograph that is never a broken image. No photo, or a photo that fails to load, shows
 * the neutral placeholder instead. The picture is decorative here (the name sits beside it), so it has
 * an empty alt and the screen reader hears the name once.
 *
 * Give it a positioned parent with a size; it fills it. Re-key it by URL so a new photo gets a new
 * chance after an earlier one failed.
 */
export function ProductPhoto({
  image,
  sizes,
  className,
}: {
  image: PosImage | null;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // An address the image optimiser may not fetch (an older host, a private address) is shown directly.
  const source = image ? resolveImageSource(image.url) : null;
  if (!image || !source || failed) {
    return (
      <div className="grid size-full place-items-center bg-inset text-ink-4">
        <Package aria-hidden="true" className="size-6" />
      </div>
    );
  }
  return (
    <Image
      src={source.src}
      unoptimized={!source.optimize}
      alt=""
      fill
      sizes={sizes}
      onError={() => setFailed(true)}
      className={cn('object-contain p-1.5', className)}
    />
  );
}
