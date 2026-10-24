'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Small viewport helpers for sheets and pickers on phones.
 *
 * `useMediaQuery` reads the query without a flash: the server snapshot is `false`, and the first
 * client render after hydration corrects it. `ViewportVars` publishes where the *visible* part of
 * the page is while an on-screen keyboard is up, as CSS variables on <html>:
 *
 *   --vv-h       height of the visual viewport (the area above the keyboard)
 *   --vv-bottom  distance between the bottom of the layout viewport and the visual one (the keyboard)
 *   --vv-top     scroll offset of the visual viewport (iOS pans it when a field is focused)
 *
 * A bottom sheet then anchors with `bottom: var(--vv-bottom, 0px)` and caps its height with
 * `var(--vv-h, 100dvh)`, so its sticky footer rides above the keyboard on iOS Safari and Android
 * Chrome alike. Nothing is published while no sheet is open.
 */

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below Tailwind's `sm` (640px): the phone layout of sheets and pickers. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 639.98px)');
}

let consumers = 0;

function publish() {
  const style = document.documentElement.style;
  const viewport = window.visualViewport;
  if (!viewport) {
    style.setProperty('--vv-h', `${window.innerHeight}px`);
    style.setProperty('--vv-bottom', '0px');
    style.setProperty('--vv-top', '0px');
    return;
  }
  style.setProperty('--vv-h', `${Math.round(viewport.height)}px`);
  style.setProperty('--vv-top', `${Math.round(viewport.offsetTop)}px`);
  style.setProperty(
    '--vv-bottom',
    `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`,
  );
}

export function ViewportVars() {
  useEffect(() => {
    consumers += 1;
    publish();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', publish);
    viewport?.addEventListener('scroll', publish);
    window.addEventListener('resize', publish);

    // A focused field inside a sheet is scrolled to the middle of what is left above the keyboard.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('input, textarea, select, [contenteditable]')) return;
      if (!target.closest('[role="dialog"]')) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 300);
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      viewport?.removeEventListener('resize', publish);
      viewport?.removeEventListener('scroll', publish);
      window.removeEventListener('resize', publish);
      document.removeEventListener('focusin', onFocusIn);
      consumers -= 1;
      if (consumers === 0) {
        const style = document.documentElement.style;
        style.removeProperty('--vv-h');
        style.removeProperty('--vv-bottom');
        style.removeProperty('--vv-top');
      }
    };
  }, []);

  return null;
}
