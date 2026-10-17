import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dutchWords } from '@/lib/language-audit';

/**
 * The public shop is English. This reads the source of every storefront file, pulls out the text a
 * customer can see or hear (everything except comments and import lines) and fails when a Dutch word
 * shows up. It is what stops an old Dutch string from coming
 * back in a later change.
 *
 * What it does not reject: brand and model names, English copy, customer input, and the stored records
 * (those are data, audited by `scripts/audit/storefront-language.ts`). `src/lib/english-content.ts` is
 * excluded because it holds the Dutch originals on purpose, to translate them.
 */
const ROOT = join(__dirname, '..', '..');

const DIRECTORIES = ['src/components/store', 'src/app/(store)', 'src/app/d', 'src/app/invoice'];
const FILES = [
  'src/app/layout.tsx',
  'src/app/opengraph-image.tsx',
  'src/app/not-found.tsx',
  'src/app/error.tsx',
  'src/app/watches/[[...path]]/route.ts',
  'src/components/forms/quote-request-form.tsx',
  'src/components/forms/restock-request-form.tsx',
  'src/lib/store-copy.ts',
  'src/lib/store-messages.ts',
  'src/lib/store-money.ts',
  'src/lib/price-tiers.ts',
  'src/lib/whatsapp.ts',
];

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

/**
 * The source without its comments (comments are developer notes and may quote the Dutch originals).
 * Strings, template text and JSX text all stay, so anything a customer can read is scanned. A small
 * state machine rather than a parser: the installed TypeScript 7 does not expose the compiler API,
 * and a new dependency is not worth it for this.
 */
function withoutComments(code: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const char = code[i] as string;
    const next = code[i + 1];
    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }
    if (char === '/' && next === '/' && code[i - 1] !== ':') {
      while (i < code.length && code[i] !== '\n') i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    out += char;
    i += 1;
  }
  return out;
}

function visibleText(file: string): string[] {
  return withoutComments(readFileSync(file, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^(import|export) .* from /.test(line));
}

describe('storefront copy is English', () => {
  const files = [
    ...DIRECTORIES.flatMap((directory) => walk(join(ROOT, directory))),
    ...FILES.map((file) => join(ROOT, file)).filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        return false;
      }
    }),
  ];

  it('scans a meaningful set of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    it(relative(ROOT, file).replaceAll('\\', '/'), () => {
      const offenders = visibleText(file)
        .map((text) => ({ text, words: dutchWords(text) }))
        .filter((entry) => entry.words.length > 0)
        .map((entry) => `${entry.words.join(', ')} in “${entry.text.slice(0, 80)}”`);
      expect(offenders).toEqual([]);
    });
  }
});
