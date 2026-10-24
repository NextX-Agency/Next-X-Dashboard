import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A voided sale payment stays in `sale_payments` as evidence (status 'voided').
 * Any reader that totals what a customer has paid must ignore it, otherwise a
 * sale shows as paid after its receipt was reversed. This guards every SQL
 * reader of `sale_payments` under src/ so a new one cannot forget the filter.
 */

const ROOT = join(__dirname, '..', '..', 'src');
const SKIP_DIRS = new Set(['migrations']);
// The schema definition and the one place that lists payments with their
// status so the sale page can show the voided rows.
const ALLOWED_FILE_SNIPPETS: { file: string; snippet: string }[] = [
  {
    file: 'queries/documents.ts',
    snippet: 'SELECT id, amount_cents::text, method::text, status::text',
  },
  { file: 'queries/documents.ts', snippet: 'SELECT id FROM sale_payments WHERE sale_id' },
  { file: 'queries/alerts.ts', snippet: '-- trace-only' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('sale_payments readers', () => {
  const files = walk(ROOT).filter((f) => !f.includes(`${join('server', 'db')}`));

  it('every raw SQL read of sale_payments excludes voided payments', () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of files) {
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const re = /\b(?:FROM|JOIN)\s+sale_payments\b/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        seen += 1;
        // The reader's WHERE clause lives within the next few lines.
        const window = text.slice(Math.max(0, m.index - 160), m.index + 420);
        const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
        const allowed = ALLOWED_FILE_SNIPPETS.some(
          (a) => rel.endsWith(a.file) && window.includes(a.snippet),
        );
        if (!allowed && !/status\s*=\s*'confirmed'/.test(window)) {
          offenders.push(`${rel}:${text.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(8);
    expect(offenders).toEqual([]);
  });
});
