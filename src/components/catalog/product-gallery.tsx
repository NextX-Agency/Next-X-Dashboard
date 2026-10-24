'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { cn } from '@/lib/cn';

/**
 * The product's photographs: a swipeable strip on a phone (native scroll-snap, so it feels like the
 * rest of the phone), arrow buttons and a row of thumbnails from `md`.
 *
 * Every picture goes through the shared `ProductThumb`, so one that cannot be loaded shows the
 * labelled placeholder instead of a broken icon, and the frame never changes size while pictures
 * arrive. With no photograph at all the whole area is a clear "No photo yet" with the way to add one.
 */
export type GalleryImage = {
  id: string;
  /** The display picture (large). */
  url: string;
  /** The thumbnail for the strip underneath. */
  thumbUrl: string | null;
  alt: string | null;
  /** Which option the photograph belongs to, e.g. "Black", or null when shared. */
  optionName: string | null;
  isPrimary: boolean;
};

export function ProductGallery({
  images,
  name,
  addPhotoHref,
}: {
  images: GalleryImage[];
  name: string;
  addPhotoHref: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = useCallback((next: number) => {
    const el = strip.current;
    if (!el) return;
    const target = Math.max(0, Math.min(next, el.children.length - 1));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    setIndex(target);
  }, []);

  // Keep the dots and thumbnails in step with a swipe.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  if (images.length === 0) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-card border border-line-subtle border-dashed bg-inset p-6 text-center">
        <div>
          <ProductThumb src={null} name={name} size="lg" className="mx-auto" />
          <p className="mt-3 font-medium text-[14px] text-ink">No photo yet</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-[12px] text-ink-3">
            A product needs a photograph before it can go on the shop.
          </p>
          <a
            href={addPhotoHref}
            className="mt-3 inline-flex h-11 items-center rounded-control bg-accent px-4 text-[14px] text-accent-fg hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Add a photo
          </a>
        </div>
      </div>
    );
  }

  const current = images[Math.min(index, images.length - 1)];

  return (
    <section
      className="w-full"
      aria-roledescription="carousel"
      aria-label={`Photos of ${name}`}
    >
      <div className="relative">
        <div
          ref={strip}
          className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-card border border-line-subtle bg-white [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, position) => (
            <figure
              key={image.id}
              className="relative m-0 size-full shrink-0 snap-center"
              aria-roledescription="slide"
              aria-label={`Photo ${position + 1} of ${images.length}`}
            >
              <ProductThumb
                src={image.url}
                name={name}
                detail={image.optionName}
                size="fill"
                priority={position === 0}
                sizes="(max-width: 767px) 100vw, 480px"
                className="rounded-none bg-white ring-0"
              />
            </figure>
          ))}
        </div>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={() => go(index - 1)}
              className="absolute top-1/2 left-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-raised/90 text-ink shadow-overlay hover:bg-raised disabled:opacity-0 md:grid focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={index >= images.length - 1}
              onClick={() => go(index + 1)}
              className="absolute top-1/2 right-2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-raised/90 text-ink shadow-overlay hover:bg-raised disabled:opacity-0 md:grid focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
            <p
              aria-hidden="true"
              className="tabular absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white"
            >
              {index + 1} / {images.length}
            </p>
          </>
        ) : null}
        {current?.optionName ? (
          <p className="absolute bottom-2 left-2 max-w-[70%] truncate rounded-full bg-raised/90 px-2 py-0.5 text-[11px] text-ink-2">
            {current.optionName}
            {current.isPrimary ? ' · main photo' : ''}
          </p>
        ) : current?.isPrimary && images.length > 1 ? (
          <p className="absolute bottom-2 left-2 rounded-full bg-raised/90 px-2 py-0.5 text-[11px] text-ink-2">
            Main photo
          </p>
        ) : null}
      </div>

      {images.length > 1 ? (
        <>
          <div className="mt-2 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
            {images.map((image, position) => (
              <span
                key={image.id}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  position === index ? 'bg-ink' : 'bg-line-strong',
                )}
              />
            ))}
          </div>
          <ul
            className="mt-2 hidden gap-2 overflow-x-auto pb-1 md:flex"
            aria-label="Choose a photo"
          >
            {images.map((image, position) => (
              <li key={image.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => go(position)}
                  aria-label={`Show photo ${position + 1}`}
                  aria-current={position === index ? 'true' : undefined}
                  className={cn(
                    'rounded-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                    position === index
                      ? 'outline-2 outline-accent'
                      : 'opacity-80 hover:opacity-100',
                  )}
                >
                  <ProductThumb
                    src={image.thumbUrl ?? image.url}
                    name={name}
                    size="md"
                    decorative
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
