'use client';

import { useEffect } from 'react';

/**
 * Renders nothing. Scrolls a sideways row (the category links) so the link marked `aria-current` is in
 * view, inside the row only: `scrollIntoView` could also move the page. Put it right after the row, with a `key` that changes with the selection so it runs again.
 */
export function ScrollToActive({ selector }: { selector: string }) {
  useEffect(() => {
    const row = document.querySelector<HTMLElement>(selector);
    const current = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !current) return;
    row.scrollLeft = Math.max(
      0,
      current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2,
    );
  }, [selector]);
  return null;
}
