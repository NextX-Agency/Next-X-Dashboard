'use client';

import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useState } from 'react';
import { cn } from '@/lib/cn';
import { type ImageSource, productInitials, resolveImageSource } from '@/lib/image-src';

/**
 * The one product photograph of the dashboard.
 *
 * Every place a product or variant is shown (lists, pickers, document lines, search, reports) uses
 * this, so a photograph behaves the same everywhere:
 *  - a fixed box, so nothing shifts while the picture loads (`xs` 32, `sm` 44, `md` 64, `lg` 120 px,
 *    or `fill` to take the size of the parent);
 *  - a quiet skeleton until the picture arrives;
 *  - `next/image` with a matching `sizes`, but only for addresses the image optimiser may fetch
 *    (see `lib/image-src.ts`); any other address is shown straight from its own host;
 *  - when the picture fails to load (a moved object, a blocked host) it is retried once directly,
 *    then replaced by a labelled placeholder with the product's initials, never a broken icon.
 *
 * `src` is the thumbnail address when one exists, else the display address (queries already prefer
 * `thumb_url`). Pass `decorative` when the product name is printed right next to it.
 */

const DIMENSIONS = { xs: 32, sm: 44, md: 64, lg: 120 } as const;
export type ThumbSize = keyof typeof DIMENSIONS | 'fill';

export function ProductThumb({
  src,
  name,
  detail,
  size = 'sm',
  decorative = false,
  priority = false,
  sizes,
  contain = true,
  className,
}: {
  src: string | null | undefined;
  /** The product (or bundle) name: the alt text, and where the placeholder's initials come from. */
  name: string;
  /** The option, e.g. "Black", appended to the alt text. */
  detail?: string | null;
  size?: ThumbSize;
  /** The name is already written next to the picture, so screen readers can skip it. */
  decorative?: boolean;
  priority?: boolean;
  /** Only for `fill`: the rendered width hint, e.g. "(max-width: 640px) 100vw, 480px". */
  sizes?: string;
  /** Fit the whole product inside the box (default). False crops to cover it. */
  contain?: boolean;
  className?: string;
}) {
  const px = size === 'fill' ? null : DIMENSIONS[size];
  const source = resolveImageSource(src);
  const alt = decorative ? '' : detail ? `${name} (${detail})` : name;
  const placeholder = <ThumbPlaceholder name={name} px={px} />;

  return (
    <span
      data-product-thumb={size}
      className={cn(
        'relative block shrink-0 overflow-hidden bg-white ring-1 ring-line-subtle ring-inset',
        px !== null && px <= 44 ? 'rounded-control' : 'rounded-card',
        size === 'fill' && 'size-full',
        className,
      )}
      style={px === null ? undefined : { width: px, height: px }}
    >
      {source ? (
        <ThumbImage
          // A new address starts a new load, with a fresh skeleton and a fresh retry.
          key={source.src}
          source={source}
          alt={alt}
          px={px}
          priority={priority}
          sizes={sizes}
          contain={contain}
          placeholder={placeholder}
        />
      ) : (
        placeholder
      )}
    </span>
  );
}

function ThumbImage({
  source,
  alt,
  px,
  priority,
  sizes,
  contain,
  placeholder,
}: {
  source: ImageSource;
  alt: string;
  px: number | null;
  priority: boolean;
  sizes: string | undefined;
  contain: boolean;
  placeholder: React.ReactNode;
}) {
  const [phase, setPhase] = useState<'loading' | 'loaded' | 'failed'>('loading');
  // First attempt follows the address' own policy; one retry goes straight to the host.
  const [direct, setDirect] = useState(!source.optimize);

  // A picture that finished loading before React attached `onLoad` (server-rendered, cached) would
  // never report it: check once when the element mounts.
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setPhase('loaded');
  }, []);

  if (phase === 'failed') return <>{placeholder}</>;

  return (
    <>
      {phase === 'loading' ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-inset motion-safe:animate-pulse"
        />
      ) : null}
      <Image
        // Switching to the direct address must create a new element, not mutate the failed one.
        key={direct ? 'direct' : 'optimized'}
        ref={imageRef}
        src={source.src}
        alt={alt}
        fill
        sizes={px === null ? (sizes ?? '(max-width: 640px) 50vw, 240px') : `${px}px`}
        unoptimized={direct}
        priority={priority}
        draggable={false}
        className={cn(
          contain ? 'object-contain' : 'object-cover',
          px === null || px > 44 ? 'p-1' : 'p-0.5',
        )}
        onLoad={() => setPhase('loaded')}
        onError={() => {
          if (!direct) {
            setDirect(true);
            setPhase('loading');
          } else {
            setPhase('failed');
          }
        }}
      />
    </>
  );
}

function ThumbPlaceholder({ name, px }: { name: string; px: number | null }) {
  const big = px === null || px >= 64;
  return (
    <span
      role="img"
      aria-label={`No photo of ${name}`}
      className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-inset text-ink-3"
    >
      <span
        aria-hidden="true"
        className="font-medium leading-none tracking-tight"
        style={{ fontSize: px === null ? 18 : Math.max(10, Math.round(px * 0.36)) }}
      >
        {productInitials(name)}
      </span>
      {big ? <ImageOff aria-hidden="true" className="size-3 text-ink-4" /> : null}
    </span>
  );
}
