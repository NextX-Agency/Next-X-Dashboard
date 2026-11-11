'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Warns before a half-entered document is thrown away.
 *
 * Pass everything the person can change as one value. What it was when the form first rendered is the
 * baseline; the guard is armed only while it differs, so an untouched form never nags. It covers a
 * tab close or reload (the browser's own prompt) and a click on any in-app link, which does not
 * reload the page and so never reaches the browser prompt. Call `markSaved` as soon as the save
 * succeeds, before navigating on.
 */
export function useUnsavedGuard(snapshot: unknown): { dirty: boolean; markSaved: () => void } {
  const baseline = useRef<string | null>(null);
  const current = JSON.stringify(snapshot);
  if (baseline.current === null) baseline.current = current;
  const [saved, setSaved] = useState(false);
  const dirty = !saved && current !== baseline.current;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest('a[href]');
      if (!link || link.getAttribute('target') === '_blank') return;
      const href = link.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      if (!window.confirm('You have unsaved changes. Leave this page without saving?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  return { dirty, markSaved: () => setSaved(true) };
}
