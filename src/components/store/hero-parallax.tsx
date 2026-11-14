'use client';

import { useEffect, useRef } from 'react';

/**
 * Lets the hero's cards lean a few pixels with the pointer. It renders nothing visible: it finds the
 * stage it sits in and writes two numbers (`--px`, `--py`, each -1 to 1) on it, at most once per frame;
 * the stylesheet turns them into movement, with each card at its own depth. Only where there is a
 * pointer that hovers, and never for a visitor who asked for less motion. Touch devices get the still
 * composition.
 */
export function HeroParallax() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = ref.current?.parentElement;
    const hero = stage?.closest<HTMLElement>('.nx-hero');
    if (!stage || !hero) return;
    if (
      !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches
    )
      return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      stage.style.setProperty('--px', x.toFixed(3));
      stage.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      const box = hero.getBoundingClientRect();
      x = ((event.clientX - box.left) / box.width - 0.5) * 2;
      y = ((event.clientY - box.top) / box.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <span ref={ref} hidden />;
}
