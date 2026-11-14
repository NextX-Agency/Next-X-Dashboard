'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Package, X } from 'lucide-react';
import Image from 'next/image';
import {
  type KeyboardEvent,
  type TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { galleryImages } from '@/lib/product-images';
import { optionName } from '@/lib/product-options';
import { useProductSelection } from './product-selection';

/**
 * The product photograph on its soft field. On a phone (below `lg`) the photographs are a swipeable
 * strip (CSS scroll-snap, no library) with dots; from `lg` one photograph shows with a thumbnail rail
 * when there is more than one. The field keeps one stable shape so switching photos never shifts the
 * page; photographs are multiplied onto it so a white-background cut-out sits on the field instead of
 * showing as a white box. Pressing the photograph opens it large in a dialog (Escape closes it, focus
 * returns to the photograph). Only the first photograph is preloaded; the rest load as they near.
 *
 * Which photographs appear follows the selected option (see src/lib/product-images.ts): its own
 * first, then the shared ones, never another option's. Choosing a different option starts again at
 * the first photograph. An option with no photograph says so instead of borrowing another colour's.
 */
export function ProductGallery({ name }: { name: string }) {
  const { images: all, variants, variant } = useProductSelection();
  const images = useMemo(
    () => galleryImages(all, variant.id, variants.length),
    [all, variant.id, variants.length],
  );
  const [position, setPosition] = useState({ variantId: variant.id, index: 0 });
  const index = position.variantId === variant.id ? position.index : 0;
  const setIndex = (next: number | ((value: number) => number)) =>
    setPosition({
      variantId: variant.id,
      index: typeof next === 'function' ? next(index) : next,
    });
  const [open, setOpen] = useState(false);
  // The main photograph fades in when the visitor changes it, never on first paint: it is the page's LCP.
  const [firstUrl] = useState(images[0]?.url);
  const [changed, setChanged] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const strip = useRef<HTMLUListElement>(null);
  const frame = useRef(0);
  // The index the strip itself reported last, so following it back is not mistaken for a jump to scroll to.
  const fromStrip = useRef(-1);
  const current = images[index];
  if (!changed && current && current.url !== firstUrl) setChanged(true);
  const optionLabel = variants.length > 1 ? optionName(variant) : null;

  // The strip follows `index` when something else changed it (the large view's arrows).
  useEffect(() => {
    const element = strip.current;
    const followed = fromStrip.current === index;
    fromStrip.current = -1;
    if (followed || !element || element.scrollWidth <= element.clientWidth) return;
    element.scrollTo({ left: index * element.clientWidth });
  }, [index]);
  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);

  if (!current) {
    return (
      <div>
        <div className="grid aspect-[6/5] place-items-center rounded-tile bg-sunken">
          <div className="grid justify-items-center gap-2 px-6 text-center">
            <Package aria-hidden="true" className="size-12 text-ink-4" />
            {optionLabel ? (
              <p className="text-[14px] text-ink-3">
                No photo of the {optionLabel} option yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const step = (direction: 1 | -1) =>
    setIndex((value) => (value + direction + images.length) % images.length);
  const alt = current.alt ?? (optionLabel ? `${name} – ${optionLabel}` : name);

  // Arrow keys move between photographs wherever the viewer is focused on the large picture.
  const onArrowKeys = (event: KeyboardEvent) => {
    if (images.length < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  };
  // A horizontal swipe turns the photograph; a mostly vertical drag is the page scrolling and is left alone.
  const swipe = {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const start = touchStart.current;
      const touch = event.changedTouches[0];
      touchStart.current = null;
      if (!start || !touch || images.length < 2) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    },
  };

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {optionLabel ? `Showing photos of the ${optionLabel} option.` : ''}
      </p>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="relative">
          <ul
            // A new option is a new strip, so it starts at its first photograph.
            key={variant.id}
            ref={strip}
            aria-label="Product photos"
            onScroll={() => {
              if (frame.current) return;
              frame.current = window.requestAnimationFrame(() => {
                frame.current = 0;
                const element = strip.current;
                if (!element?.clientWidth) return;
                const next = Math.round(element.scrollLeft / element.clientWidth);
                if (next === index || next < 0 || next >= images.length) return;
                fromStrip.current = next;
                setIndex(next);
              });
            }}
            className="nx-gallery flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-tile bg-sunken [scrollbar-width:none] lg:block lg:overflow-hidden [&::-webkit-scrollbar]:hidden"
          >
            {images.map((image, imageIndex) => (
              <li
                key={image.url}
                data-current={imageIndex === index}
                className={cn(
                  'relative aspect-[6/5] w-full shrink-0 snap-center snap-always lg:hidden lg:data-[current=true]:block',
                  changed &&
                    'lg:data-[current=true]:animate-in lg:data-[current=true]:fade-in-0 lg:data-[current=true]:duration-300 lg:data-[current=true]:ease-out-instrument',
                )}
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? (optionLabel ? `${name} – ${optionLabel}` : name)}
                  fill
                  preload={imageIndex === 0}
                  {...(imageIndex === 0 ? { fetchPriority: 'high' as const } : {})}
                  sizes="(max-width: 1023px) 100vw, min(54vw, 700px)"
                  className="object-contain p-[7%] mix-blend-multiply"
                  {...(image.blurDataUrl
                    ? { placeholder: 'blur' as const, blurDataURL: image.blurDataUrl }
                    : {})}
                />
                {/* Not a Dialog.Trigger: with several triggers Radix would hand focus back to the last
                    one on close, scrolling the strip away from the photograph that was open. */}
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={
                    images.length > 1
                      ? `Enlarge photo ${imageIndex + 1} of ${images.length}: ${name}`
                      : `Enlarge photo of ${name}`
                  }
                  onClick={() => setOpen(true)}
                  onKeyDown={onArrowKeys}
                  className="absolute inset-0 cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring"
                />
              </li>
            ))}
          </ul>
          {images.length > 1 ? (
            <>
              {/* Phone: dots over the lower edge of the photograph. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1.5 lg:hidden"
              >
                {images.map((image, imageIndex) => (
                  <span
                    key={image.url}
                    className={cn(
                      'h-1.5 rounded-full transition-[width,background-color]',
                      imageIndex === index ? 'w-4 bg-ink' : 'w-1.5 bg-line-strong',
                    )}
                  />
                ))}
              </span>
              <span
                aria-hidden="true"
                className="tabular absolute bottom-3 left-4 hidden font-semibold text-[12px] text-ink-2 lg:block"
              >
                {index + 1} / {images.length}
              </span>
            </>
          ) : null}
        </div>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-night/70 duration-200 ease-out-instrument data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            onKeyDown={onArrowKeys}
            // Focus returns to the photograph now showing in the strip, without scrolling it.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              strip.current
                ?.querySelector<HTMLElement>('[data-current="true"] button')
                ?.focus({ preventScroll: true });
            }}
            className="nx-store fixed inset-3 z-50 flex flex-col overflow-hidden rounded-tile bg-base text-ink shadow-overlay duration-200 ease-out-instrument data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2 sm:inset-8 lg:inset-x-[12%] lg:inset-y-8"
          >
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
            <div className="relative min-h-0 flex-1 touch-pan-y bg-sunken" {...swipe}>
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
        <ul
          className="mt-3 hidden gap-2 overflow-x-auto pb-1 lg:flex"
          aria-label="Choose a photo"
        >
          {images.map((image, imageIndex) => (
            <li key={image.url} className="shrink-0">
              <button
                type="button"
                aria-label={`Show photo ${imageIndex + 1} of ${images.length}`}
                aria-current={imageIndex === index}
                onClick={() => setIndex(imageIndex)}
                className={cn(
                  'relative block size-20 overflow-hidden rounded-[12px] bg-sunken',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  'nx-press',
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
