'use client';

import { Package } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';

type GalleryImage = {
  url: string;
  width: number;
  height: number;
  alt: string | null;
  blurDataUrl: string | null;
};

/**
 * Large primary image with a thumbnail rail. Thumbnails are real buttons, so the
 * gallery works from the keyboard; the stage keeps one stable aspect ratio so
 * switching images never shifts the page.
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index];

  if (!current) {
    return (
      <div className="nx-stage grid aspect-square place-items-center">
        <Package aria-hidden="true" className="size-12 text-night-ink-2" />
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-tile bg-sunken lg:aspect-[5/6]">
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt ?? name}
          fill
          priority={index === 0}
          sizes="(max-width: 1024px) 100vw, 56vw"
          className="animate-in fade-in-0 object-cover mix-blend-multiply duration-300"
          {...(current.blurDataUrl
            ? { placeholder: 'blur' as const, blurDataURL: current.blurDataUrl }
            : {})}
        />
        {images.length > 1 ? (
          <p className="nx-label tabular absolute bottom-3 left-3 bg-night px-2 py-1 text-[10px] text-night-ink">
            {index + 1} / {images.length}
          </p>
        ) : null}
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Productfoto’s">
          {images.map((image, imageIndex) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                aria-label={`Toon foto ${imageIndex + 1} van ${images.length}`}
                aria-current={imageIndex === index}
                onClick={() => setIndex(imageIndex)}
                className={cn(
                  'relative block size-16 overflow-hidden rounded-tile bg-sunken outline-offset-2 sm:size-20',
                  'focus-visible:outline-2 focus-visible:outline-ring',
                  imageIndex === index
                    ? 'ring-2 ring-ink ring-offset-2 ring-offset-base'
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover mix-blend-multiply"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
