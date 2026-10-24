'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Hides the top and bottom bars while you read down and brings them back on the first scroll up.
 *
 * It only flips `data-chrome="hidden"` on <html>; `app/(app)/mobile.css` does the moving (transform
 * only, so nothing reflows) and republishes `--shell-top` for sticky children. Below `lg` only: on
 * a desktop the bar is a fixture.
 *
 * Rules: a downward drag of more than 10px past the first 80px hides, any upward drag of 6px shows,
 * and the top of the page, a route change, a keyboard opening or focus landing in the bar all show.
 * The scroll handler is passive and does one comparison per animation frame.
 */
export function ScrollChrome() {
  const pathname = usePathname();

  // Every navigation starts with the bars showing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pathname is the trigger, not a value read here
  useEffect(() => {
    document.documentElement.removeAttribute('data-chrome');
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const query = window.matchMedia('(max-width: 1023.98px)');
    let lastY = window.scrollY;
    let frame = 0;

    const set = (next: boolean) => {
      const hidden = root.dataset.chrome === 'hidden';
      if (next === hidden) return;
      if (next) root.dataset.chrome = 'hidden';
      else root.removeAttribute('data-chrome');
    };

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY;
      if (!query.matches || y <= 80) {
        set(false);
      } else if (delta > 10) {
        set(true);
      } else if (delta < -6) {
        set(false);
      }
      if (Math.abs(delta) > 6 || y <= 80) lastY = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocusIn = (event: FocusEvent) => {
      // Tabbing into the bar, or the keyboard opening on a field, must not leave the bar hidden.
      const target = event.target;
      if (target instanceof Element && target.closest('header, .app-topbar')) set(false);
    };
    const onQuery = () => set(false);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    query.addEventListener('change', onQuery);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocusIn);
      query.removeEventListener('change', onQuery);
      if (frame) cancelAnimationFrame(frame);
      root.removeAttribute('data-chrome');
    };
  }, []);

  return null;
}
