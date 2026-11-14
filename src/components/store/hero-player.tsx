'use client';

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Arrow } from './arrow';

export type HeroTrack = {
  id: string;
  href: string;
  name: string;
  imageUrl: string | null;
  /** The rendered price (`StorePrice`), so this component knows nothing about currencies. */
  price: ReactNode;
};

/** How long one product stays on before the next one comes up. */
const TRACK_SECONDS = 6;

/**
 * The hero as a record player, because this is an audio shop: the products are the tracks. The white
 * sleeve shows the current product's photograph (never tinted), an orange record turns half out of it,
 * and the controls under it are a player's: back, play or pause, forward, and one progress bar per
 * product.
 *
 * - Every product is a real link in the page from the first render; only the current one is shown and
 *   reachable.
 * - It plays by itself only after the page is interactive and only for a visitor who has not asked for
 *   less motion; anyone can pause it (the button satisfies "pause, stop, hide"). The timer is the
 *   progress bar's own CSS animation, so there is no interval to drift or leak.
 * - `data-playing` on the hero tells the equalizer (`HeroWave`) whether to move.
 */
export function HeroPlayer({ tracks, seal }: { tracks: HeroTrack[]; seal: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // A manual step is announced; the automatic ones are not, or a screen reader would never be quiet.
  const [announce, setAnnounce] = useState(false);
  const current = tracks[index] ?? tracks[0];
  const several = tracks.length > 1;

  useEffect(() => {
    if (!several) return;
    if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) setPlaying(true);
  }, [several]);

  useEffect(() => {
    const hero = root.current?.closest<HTMLElement>('.nx-hero');
    if (hero) hero.dataset.playing = playing ? 'true' : 'false';
  }, [playing]);

  if (!current) return null;

  const step = (delta: number, manual: boolean) => {
    setAnnounce(manual);
    setIndex((value) => (value + delta + tracks.length) % tracks.length);
  };
  const ring = `${seal.join('  ·  ')}  ·  `.toUpperCase();
  const button =
    'nx-press grid size-12 shrink-0 place-items-center border border-line-strong text-ink hover:border-ink hover:bg-ink hover:text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  return (
    <div ref={root} className="nx-player">
      <div className="nx-player-stage">
        {/* The record: decoration only. Re-keyed per product so it slides out of the sleeve again. */}
        <div key={current.id} className="nx-record-slot" aria-hidden="true">
          <svg
            aria-hidden="true"
            viewBox="0 0 200 200"
            className={cn('nx-record', playing && 'nx-record-playing')}
          >
            <circle cx="100" cy="100" r="100" fill="#ed5f0f" />
            {[92, 84, 76, 68, 60, 52].map((r) => (
              <circle
                key={r}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke="#0e0d0c"
                strokeOpacity="0.22"
                strokeWidth="1"
              />
            ))}
            {/* Two wedges of light, so the turning is visible. */}
            <path d="M100 100L196 74A100 100 0 0 1 196 126Z" fill="#fff" fillOpacity="0.16" />
            <path d="M100 100L4 126A100 100 0 0 1 4 74Z" fill="#fff" fillOpacity="0.1" />
            <circle cx="100" cy="100" r="40" fill="#0e0d0c" />
            <path
              id="nx-record-ring"
              d="M100 100m-30 0a30 30 0 1 1 60 0a30 30 0 1 1-60 0"
              fill="none"
            />
            {seal.length >= 2 ? (
              <text fill="#eeebe5" fontSize="6.4" fontWeight="600">
                <textPath href="#nx-record-ring" textLength="186" lengthAdjust="spacing">
                  {ring}
                </textPath>
              </text>
            ) : null}
            <circle cx="100" cy="100" r="5" fill="#ed5f0f" />
          </svg>
        </div>

        <ul aria-label="Products" className="nx-sleeve">
          {tracks.map((track, position) => {
            const active = position === index;
            return (
              <li
                key={track.id}
                className={cn('nx-sleeve-face', active && 'nx-sleeve-face-on')}
                aria-hidden={active ? undefined : true}
              >
                <Link
                  href={track.href as never}
                  tabIndex={active ? undefined : -1}
                  aria-label={track.name}
                  className="relative block size-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  {track.imageUrl ? (
                    <Image
                      src={track.imageUrl}
                      alt=""
                      fill
                      // The first sleeve is the page's largest image: fetch it first, skip the lazy wait.
                      fetchPriority={position === 0 ? 'high' : 'auto'}
                      loading={position === 0 ? 'eager' : 'lazy'}
                      sizes="(max-width: 1023px) 70vw, 30vw"
                      className="object-contain p-[9%]"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 sm:mt-7">
        <div key={current.id} className="nx-swap min-w-0">
          <p className="nx-display truncate text-[clamp(22px,2.6vw,36px)] text-ink">
            {current.name}
          </p>
          <div className="mt-2">{current.price}</div>
        </div>
        <Link
          href={current.href as never}
          className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 font-semibold text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="nx-link-line py-1">View</span> <Arrow />
        </Link>
      </div>

      {several ? (
        <div className="mt-5 flex items-center gap-2 sm:mt-6">
          <button
            type="button"
            className={button}
            aria-label="Previous product"
            onClick={() => step(-1, true)}
          >
            <SkipBack aria-hidden="true" className="size-[18px]" />
          </button>
          <button
            type="button"
            className={cn(button, 'border-cta bg-cta text-cta-fg hover:border-ink')}
            aria-label={playing ? 'Pause' : 'Play'}
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? (
              <Pause aria-hidden="true" className="size-[18px]" />
            ) : (
              <Play aria-hidden="true" className="size-[18px]" />
            )}
          </button>
          <button
            type="button"
            className={button}
            aria-label="Next product"
            onClick={() => step(1, true)}
          >
            <SkipForward aria-hidden="true" className="size-[18px]" />
          </button>
          <div className="ml-3 flex min-w-0 flex-1 gap-1.5" aria-hidden="true">
            {tracks.map((track, position) => (
              <span key={track.id} className="nx-track">
                <span
                  // Re-keyed with the product so the bar starts from zero each time.
                  key={position === index ? `on-${index}` : 'off'}
                  className={cn(
                    'nx-track-fill',
                    position < index && 'nx-track-done',
                    position === index && 'nx-track-on',
                    position === index && !playing && 'nx-track-held',
                  )}
                  style={{ animationDuration: `${TRACK_SECONDS}s` }}
                  onAnimationEnd={position === index ? () => step(1, false) : undefined}
                />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live={announce ? 'polite' : 'off'}>
        {`${current.name}, product ${index + 1} of ${tracks.length}`}
      </p>
    </div>
  );
}
