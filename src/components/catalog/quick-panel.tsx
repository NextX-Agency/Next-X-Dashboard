'use client';

import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { useIsPhone } from '@/components/ui/viewport';
import { cn } from '@/lib/cn';

/**
 * A small editing surface opened from a figure in a list row (a price, a stock count).
 *
 * On a phone it is the dashboard's bottom sheet (large fields, a sticky footer above the keyboard);
 * from `sm` it is a popover anchored to the figure, so the row stays in view while it is edited.
 * Either way Enter in a field submits the surrounding form and Escape closes it.
 *
 * The trigger is passed in because it differs per place; the panel only decides where the content
 * goes. `footer` holds the buttons: it sits in the sheet's sticky footer on a phone and under the
 * fields in the popover.
 */
export function QuickPanel({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  children,
  width = 'w-[min(360px,calc(100vw-2rem))]',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The button that opens the panel. Receives the open handler on a phone. */
  trigger: (props: { onClick?: () => void }) => ReactNode;
  title: string;
  description?: string;
  footer: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const phone = useIsPhone();

  if (phone) {
    return (
      <>
        {trigger({ onClick: () => onOpenChange(true) })}
        <Sheet
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          {...(description ? { description } : {})}
          footer={footer}
        >
          {children}
        </Sheet>
      </>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger({})}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 max-h-[min(70vh,520px)] overflow-y-auto rounded-card border border-line bg-overlay p-3 shadow-overlay outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 duration-150',
            width,
          )}
        >
          <p className="font-medium text-[13px] text-ink">{title}</p>
          {description ? <p className="mt-0.5 text-[12px] text-ink-3">{description}</p> : null}
          <div className="mt-3">{children}</div>
          <div className="mt-3 flex items-center justify-end gap-2">{footer}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
