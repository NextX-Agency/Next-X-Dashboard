'use client';

import { useEffect, useRef } from 'react';

const BAR = 3; // px
const GAP = 7; // px
const ORANGE = '#ed5f0f';

/**
 * A live equalizer along the foot of the hero: thin bars of the logo orange that rise and fall like a
 * level meter and surge under the pointer. Decoration only (`aria-hidden`), drawn on one canvas.
 *
 * - It only runs while the hero is on screen and the tab is visible.
 * - It follows the player: while the products are "playing" (`data-playing` on the hero) the bars are
 *   lively, when paused they settle low.
 * - A visitor who asked for less motion gets one still frame.
 */
export function HeroWave() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const hero = canvas?.closest<HTMLElement>('.nx-hero');
    const context = canvas?.getContext('2d');
    if (!canvas || !hero || !context) return;

    const still = !window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    let level = still ? 0.55 : 0.2;
    let pointer = -9999;
    let surge = 0;

    const size = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (time: number) => {
      const t = time / 1000;
      const target = hero.dataset.playing === 'true' ? 1 : 0.22;
      level += (target - level) * 0.04;
      surge *= 0.96;
      context.clearRect(0, 0, width, height);
      context.fillStyle = ORANGE;
      for (let x = 0; x < width; x += BAR + GAP) {
        // Three waves of different length and speed, so the row never visibly repeats.
        const slow = 0.5 + 0.5 * Math.sin(x * 0.011 - t * 0.9);
        const mid = 0.5 + 0.5 * Math.sin(x * 0.047 + t * 1.7);
        const fast = 0.5 + 0.5 * Math.sin(x * 0.19 + t * 4.3);
        const near = Math.exp(-(((x - pointer) / 130) ** 2)) * surge;
        const amount = Math.min(
          1,
          level * (0.12 + 0.5 * slow * mid + 0.16 * fast) + near * 0.75,
        );
        const bar = Math.max(2, amount * height);
        context.fillRect(x, height - bar, BAR, bar);
      }
    };

    const loop = (time: number) => {
      draw(time);
      frame = visible && !still ? requestAnimationFrame(loop) : 0;
    };
    const start = () => {
      if (!frame && visible && !still) frame = requestAnimationFrame(loop);
    };
    const onMove = (event: PointerEvent) => {
      pointer = event.clientX - canvas.getBoundingClientRect().left;
      surge = 1;
    };
    const onVisibility = () => {
      visible = !document.hidden;
      start();
    };

    size();
    if (still) draw(0);
    const resize = new ResizeObserver(() => {
      size();
      if (still) draw(0);
    });
    resize.observe(canvas);
    const watch = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting) && !document.hidden;
      start();
    });
    watch.observe(hero);
    hero.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    start();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      watch.disconnect();
      hero.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div aria-hidden="true" className="nx-wave">
      <canvas ref={ref} className="block size-full" />
    </div>
  );
}
