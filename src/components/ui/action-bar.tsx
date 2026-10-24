'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ViewportVars } from './viewport';

/**
 * The one fixed bar at the foot of a long phone form: the running total, the warning that matters
 * and the primary action, always in reach of the thumb.
 *
 * Phones only (below `md`); from `md` the page's own in-flow summary does this job. It carries
 * `data-hides-tabbar`, which tells the bottom navigation (app/(app)/mobile.css) to step aside so
 * there is never more than one bar down there. It lifts above the on-screen keyboard
 * (`ViewportVars`) and respects the home-indicator inset.
 *
 * The page keeps the bottom padding for it (`pb-28`).
 */
export function ActionBar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-hides-tabbar=""
      className={cn(
        'fixed inset-x-0 bottom-[var(--vv-bottom,0px)] z-30 border-line border-t bg-raised md:hidden',
        'shadow-[0_-6px_18px_-10px_rgb(0_0_0/0.25)]',
        'pt-2 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]',
        className,
      )}
    >
      <ViewportVars />
      {children}
    </div>
  );
}

/** Scrolls to the in-flow summary the bar belongs to (reduced motion: jumps). */
export function scrollToId(id: string) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduced ? 'auto' : 'smooth',
    block: 'start',
  });
}
