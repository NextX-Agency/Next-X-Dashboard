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
 * The product photograph on its soft field, with a thumbnail rail when there is more than one. The
 * field keeps one stable shape so switching photos never shifts the page; photographs are multiplied
 * onto it so a white-background cut-out sits on the field instead of showing as a white box.
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = images[index];

  if (!current) {
    return (
      <div className="grid aspect-square place-items-center rounded-tile bg-sunken">
        <Package aria-hidden="true" className="size-12 text-ink-4" />
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-tile bg-sunken lg:aspect-[6/5]">
        <Image
          key={current.url}
          src={current.url}
          alt={current.alt ?? name}
          fill
          priority={index === 0}
          sizes="(max-width: 1024px) 100vw, 56vw"
          className="animate-in fade-in-0 object-contain p-[7%] mix-blend-multiply duration-300"
          {...(current.blurDataUrl
            ? { placeholder: 'blur' as const, blurDataURL: current.blurDataUrl }
            : {})}
        />
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
                  'relative block size-16 overflow-hidden rounded-[12px] bg-sunken sm:size-20',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  imageIndex === index ? 'ring-2 ring-ink' : 'opacity-70 hover:opacity-100',
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-contain p-1.5 mix-blend-multiply"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
