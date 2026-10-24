'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { cn } from '@/lib/cn';

/**
 * A panel whose body folds away on a phone, so the one thing worth seeing first (the alerts) can
 * lead the page without pushing everything else a screen down once it has been read.
 *
 * From `md` it is an ordinary panel: the same `SurfaceHeader`, always open. Below that the header
 * is a button with an optional count and a chevron.
 */
export function CollapsibleSurface({
  title,
  hint,
  summary,
  count,
  tone = 'neutral',
  defaultOpen = true,
  children,
}: {
  title: string;
  hint: string;
  /** Shown under the title instead of the hint while the phone panel is folded: the top item, say. */
  summary?: string;
  /** Shown as a pill on the phone header. */
  count?: number;
  tone?: 'neutral' | 'warning' | 'negative';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <Surface>
      <div className="max-md:hidden">
        <SurfaceHeader title={title} hint={hint} />
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:hidden"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-medium text-[14px] text-ink">{title}</span>
            {count ? (
              <span
                className={cn(
                  'tabular grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px]',
                  tone === 'negative' && 'bg-negative-muted text-negative',
                  tone === 'warning' && 'bg-warning-muted text-warning',
                  tone === 'neutral' && 'bg-inset text-ink-2',
                )}
              >
                {count}
              </span>
            ) : null}
          </span>
          {!open || !count ? (
            <span className="block truncate text-[12px] text-ink-3">
              {!open && summary ? summary : hint}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-ink-3 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={bodyId}
        className={cn('max-md:border-line-subtle max-md:border-t', !open && 'max-md:hidden')}
      >
        {children}
      </div>
    </Surface>
  );
}
