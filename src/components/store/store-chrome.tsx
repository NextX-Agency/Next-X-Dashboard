'use client';

import { useEffect } from 'react';

/** Phones, and phones turned sideways: the only places the header gets out of the way. */
const COMPACT = '(max-width: 639px), (max-width: 1023px) and (max-height: 500px)';
/** Never hide while the page is within this many px of the top. */
const TOP = 8;
/** Do not hide before the header has scrolled away on its own. */
const HIDE_AFTER = 72;
/** Smallest movement that counts as a direction, so a thumb resting on the glass never flickers. */
const STEP = 6;

/**
 * Renders nothing. It decides whether the shop's phone chrome (the header and the tab bar) is shown or
 * out of the way, and says so with ONE attribute, `data-nx-chrome="hidden"`, on <html>. The stylesheet
 * does the rest with `transform` only (see globals.css), so nothing ever changes size: no layout shift.
 *
 * Scrolling down hides it, scrolling up brings it back, and it is always shown at the top of the page,
 * while the search field has focus and when something inside it takes keyboard focus. The scroll
 * position is clamped to the document before it is compared, so an iOS rubber band at either end
 * (negative or beyond the bottom) never reads as a direction. The listener is passive and its work
 * happens once per frame.
 */
export function StoreChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const compact = window.matchMedia(COMPACT);
    let anchor = window.scrollY;
    let hidden = false;
    let frame = 0;

    const set = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      if (next) root.dataset.nxChrome = 'hidden';
      else delete root.dataset.nxChrome;
    };

    const update = () => {
      frame = 0;
      const limit = Math.max(0, root.scrollHeight - window.innerHeight);
      const y = Math.min(Math.max(window.scrollY, 0), limit);
      if (!compact.matches || y <= TOP) {
        anchor = y;
        set(false);
        return;
      }
      const delta = y - anchor;
      if (Math.abs(delta) < STEP) return;
      anchor = y;
      if (delta < 0) set(false);
      else if (y > HIDE_AFTER && !document.querySelector('.nx-header:focus-within')) set(true);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Element && event.target.closest('.nx-header, .nx-tabbar')) {
        set(false);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    compact.addEventListener('change', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusin', onFocusIn);
      compact.removeEventListener('change', onScroll);
      window.cancelAnimationFrame(frame);
      delete root.dataset.nxChrome;
    };
  }, []);

  return null;
}
