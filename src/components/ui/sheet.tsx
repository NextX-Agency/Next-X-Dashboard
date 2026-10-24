'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ViewportVars } from './viewport';

/**
 * Side sheet, used for every create and edit form.
 *
 * A sheet rather than a full page because entry almost always happens *while*
 * looking at a list: recording a sale, you want the stock figures still on
 * screen behind it. A route change would take that context away and make
 * cancelling feel like losing your place.
 *
 * Wide enough (`560px`, `720px` for line items) that a table of line items is
 * genuinely usable, which is where most drawer-based forms fall down.
 */

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'md' | 'lg';
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]',
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out',
            'motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0',
          )}
        />
        <Dialog.Content
          // On a touch screen nothing should look focused (or raise the keyboard) the moment a sheet
          // opens; the sheet itself takes focus and the trap still holds.
          onOpenAutoFocus={(event) => {
            if (!window.matchMedia('(pointer: coarse)').matches) return;
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus({ preventScroll: true });
          }}
          className={cn(
            'fixed z-50 flex flex-col overscroll-contain bg-base shadow-overlay outline-none',
            // Phone: a bottom sheet, 92dvh tall, riding above the on-screen keyboard (ViewportVars).
            'inset-x-0 bottom-[var(--vv-bottom,0px)] h-[min(92dvh,var(--vv-h,100dvh))] rounded-t-[18px] border-line-subtle border-t',
            // From `sm`: the side sheet it always was.
            'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-auto sm:w-full sm:rounded-none sm:border-t-0 sm:border-l',
            size === 'lg' ? 'sm:max-w-[720px]' : 'sm:max-w-[560px]',
            'motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out',
            'motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:data-[state=open]:slide-in-from-bottom',
            'sm:motion-safe:data-[state=closed]:slide-out-to-right sm:motion-safe:data-[state=open]:slide-in-from-right',
            'motion-safe:duration-200 ease-out-instrument',
          )}
        >
          <ViewportVars />
          <header className="relative flex shrink-0 items-start justify-between gap-3 border-line-subtle border-b px-4 pt-3 pb-1 sm:gap-4 sm:px-5 sm:py-4">
            <span
              aria-hidden="true"
              className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong/60 sm:hidden"
            />
            <div className="min-w-0 self-center py-1.5 sm:py-0">
              <Dialog.Title className="font-medium text-[16px] text-ink tracking-[-0.01em] sm:text-[15px]">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[12px] text-ink-3 leading-relaxed">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-2 grid size-11 shrink-0 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:mr-0 sm:size-7 sm:text-ink-4"
              aria-label="Close"
            >
              <X className="size-5 sm:size-4" />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain scroll-pb-24 px-4 py-4 sm:px-5 sm:py-5">
            {children}
          </div>

          {footer ? (
            <footer
              className={cn(
                'flex shrink-0 items-center justify-end gap-2 border-line-subtle border-t bg-inset px-4 py-3 sm:px-5',
                'pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3',
                // Phone: the primary action takes the width and is 48px tall.
                'max-sm:[&>button]:h-12 max-sm:[&>button]:text-[15px] max-sm:[&>button[type=submit]]:flex-1',
              )}
            >
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled block of related fields inside a sheet. */
export function SheetSection({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('mb-6 last:mb-0', className)}>
      <div className="mb-3 border-line-subtle border-b pb-1.5">
        <h3 className="font-medium text-[11px] text-ink-3 uppercase tracking-[0.08em]">
          {title}
        </h3>
        {hint ? <p className="mt-1 text-[11px] text-ink-4">{hint}</p> : null}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
