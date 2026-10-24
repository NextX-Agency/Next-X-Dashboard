import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const css = readFileSync('src/styles/tokens.css', 'utf8');
/** The declarations of the first rule that opens with `selector {`. */
function tokens(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n}', start);
  const map = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/(--nx-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    map.set(match[1] as string, match[2] as string);
  }
  return map;
}

describe('dashboard text contrast (light)', () => {
  const light = tokens(':root');
  const surfaces = ['--nx-bg-base', '--nx-bg-raised', '--nx-bg-sunken'] as const;

  for (const text of [
    '--nx-text',
    '--nx-text-secondary',
    '--nx-text-tertiary',
    '--nx-text-faint',
  ] as const) {
    for (const surface of surfaces) {
      it(`${text} on ${surface} is at least 4.5:1`, () => {
        const fg = light.get(text);
        const bg = light.get(surface);
        expect(fg && bg).toBeTruthy();
        expect(contrast(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
