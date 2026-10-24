'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/cn';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

/**
 * Cross-fade the whole page when the theme changes, using the browser's View Transitions API
 * (opacity only, about 200ms). Falls back to an instant switch where the API is missing or the
 * person asked for reduced motion. `flushSync` makes the new theme land inside the snapshot.
 */
function switchTheme(setTheme: (value: string) => void, value: ThemeValue) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown })
    .startViewTransition;
  if (reduced || typeof start !== 'function') {
    setTheme(value);
    return;
  }
  start.call(document, () => flushSync(() => setTheme(value)));
}

/**
 * Theme control. From `sm` up it is a segmented three-way control (Light, System, Dark) with the
 * active option drawn as a raised, outlined pill in the accent colour. On a phone there is no room
 * for three 44px targets in the top bar, so it is one 44px button that shows the current choice
 * and steps to the next on tap; the label names both the current theme and what a tap does.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: ThemeValue =
    mounted && (theme === 'light' || theme === 'dark') ? theme : 'system';
  const resolved = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';
  const currentIndex = OPTIONS.findIndex((option) => option.value === current);
  const next = OPTIONS[(currentIndex + 1) % OPTIONS.length] ?? OPTIONS[0];
  const CurrentIcon = OPTIONS[currentIndex]?.Icon ?? Monitor;

  return (
    <>
      <button
        type="button"
        onClick={() => switchTheme(setTheme, next.value)}
        aria-label={`Theme: ${current === 'system' ? `system (${resolved})` : current}. Switch to ${next.label.toLowerCase()}.`}
        title={`Theme: ${current === 'system' ? `System (${resolved})` : OPTIONS[currentIndex]?.label}`}
        className="grid size-11 place-items-center rounded-control border border-line-strong bg-active text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:hidden"
      >
        <CurrentIcon aria-hidden="true" className="size-4" />
      </button>

      <fieldset className="hidden items-center gap-0.5 rounded-control border border-line bg-inset p-0.5 sm:inline-flex">
        <legend className="sr-only">Colour theme</legend>
        {OPTIONS.map(({ value, label, Icon }) => {
          const active = mounted && theme === value;
          const tooltip = value === 'system' && mounted ? `System (${resolved})` : label;
          return (
            <button
              key={value}
              type="button"
              onClick={() => switchTheme(setTheme, value)}
              aria-label={tooltip}
              title={tooltip}
              aria-pressed={active}
              className={cn(
                'grid size-8 place-items-center rounded-[4px] transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                active
                  ? 'border border-line-strong bg-active text-accent'
                  : 'text-ink-4 hover:text-ink-2',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          );
        })}
      </fieldset>
    </>
  );
}
