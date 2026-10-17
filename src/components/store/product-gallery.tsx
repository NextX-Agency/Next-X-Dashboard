'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Maximize2, Package, X } from 'lucide-react';
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
 * onto it so a white-background cut-out sits on the field instead of showing as a white box. Pressing
 * the photograph opens it large in a dialog (Escape closes it, focus returns to the photograph).
 */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const current = images[index];

  if (!current) {
    return (
      <div className="grid aspect-square place-items-center rounded-tile bg-sunken">
        <Package aria-hidden="true" className="size-12 text-ink-4" />
      </div>
    );
  }

  const step = (direction: 1 | -1) =>
    setIndex((value) => (value + direction + images.length) % images.length);
  const alt = current.alt ?? name;

  return (
    <div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="relative aspect-square overflow-hidden rounded-tile bg-sunken lg:aspect-[6/5]">
          <Image
            key={current.url}
            src={current.url}
            alt={alt}
            fill
            priority={index === 0}
            sizes="(max-width: 1024px) 100vw, 56vw"
            className="animate-in fade-in-0 object-contain p-[7%] mix-blend-multiply duration-300"
            {...(current.blurDataUrl
              ? { placeholder: 'blur' as const, blurDataURL: current.blurDataUrl }
              : {})}
          />
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={`Enlarge photo of ${name}`}
              className="group absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
            >
              <span
                aria-hidden="true"
                className="absolute right-3 bottom-3 grid size-10 place-items-center rounded-full bg-base/90 text-ink shadow-sm"
              >
                <Maximize2 className="size-4" />
              </span>
            </button>
          </Dialog.Trigger>
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-night/70 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="nx-store fixed inset-3 z-50 flex flex-col overflow-hidden rounded-tile bg-base text-ink shadow-overlay sm:inset-8 lg:inset-x-[12%] lg:inset-y-8">
            <div className="flex h-14 shrink-0 items-center justify-between border-line border-b px-4">
              <Dialog.Title className="truncate pr-4 font-semibold text-[15px]">
                {name}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Photo {index + 1} of {images.length}. Press Escape to close.
              </Dialog.Description>
              <Dialog.Close
                aria-label="Close"
                className="-mr-2 grid size-11 place-items-center rounded-full hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>
            <div className="relative min-h-0 flex-1 bg-sunken">
              <Image
                key={current.url}
                src={current.url}
                alt={alt}
                fill
                sizes="100vw"
                className="object-contain p-4 mix-blend-multiply"
              />
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => step(-1)}
                    className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-base/90 shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => step(1)}
                    className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-base/90 shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {images.length > 1 ? (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Product photos">
          {images.map((image, imageIndex) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                aria-label={`Show photo ${imageIndex + 1} of ${images.length}`}
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
