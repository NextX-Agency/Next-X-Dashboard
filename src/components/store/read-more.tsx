'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A long piece of text that is cut to a few lines on a phone, with a "Read more" button. Everywhere
 * else, and when the text is short, nothing changes. The text is complete in the page from the first
 * byte (search engines and screen readers see all of it); the cut is applied before the first paint
 * of the hydrated page, only when it really is longer than `lines`, and only below `lg`.
 */
export function ReadMore({
  lines = 6,
  children,
}: {
  /** Lines shown before the button. */
  lines?: number;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'plain' | 'cut' | 'open'>('plain');
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || !window.matchMedia('(max-width: 1023px)').matches) return;
    const lineHeight = Number.parseFloat(
      getComputedStyle(element.querySelector('p') ?? element).lineHeight,
    );
    // Paragraphs are separated by a gap; count from the first line down and allow a little slack so a
    // text that only just overflows is not cut for one line.
    const limit = (Number.isFinite(lineHeight) ? lineHeight : 24) * lines;
    if (element.scrollHeight > limit * 1.25) {
      setHeight(limit);
      setState('cut');
    }
  }, [lines]);

  const cut = state === 'cut';
  return (
    <div>
      <div
        ref={box}
        className={cut ? 'relative overflow-hidden' : undefined}
        style={cut ? { maxHeight: height } : undefined}
      >
        {children}
        {cut ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-base to-transparent"
          />
        ) : null}
      </div>
      {state === 'plain' ? null : (
        <button
          type="button"
          aria-expanded={state === 'open'}
          onClick={() => setState(cut ? 'open' : 'cut')}
          className="mt-2 inline-flex min-h-11 items-center font-bold text-[14px] text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {cut ? 'Read more' : 'Show less'}
        </button>
      )}
    </div>
  );
}
