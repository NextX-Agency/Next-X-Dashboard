/**
 * Language audit for the public shop.
 *
 *   pnpm exec tsx scripts/audit/storefront-language.ts          # stored records (needs DATABASE_URL)
 *   pnpm exec tsx scripts/audit/storefront-language.ts --source # every source file under src/
 *
 * Records mode lists Dutch still sitting in published product copy, category and brand names and the
 * shop settings. It reads only, and it reports the raw stored text: what a customer sees may already be
 * English through `src/lib/english-content.ts`, and the report marks those. Source mode is the same
 * detector pointed at the code, to find strings the guard test does not cover.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dutchWords } from '../../src/lib/language-audit';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === 'node_modules' ? [] : walk(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function sourceMode() {
  const skip = /english-content|language-audit|[\\/]preview[\\/]|\.test\./;
  for (const file of walk(join(ROOT, 'src'))) {
    if (skip.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const words = dutchWords(line);
      if (words.length)
        console.log(`${relative(ROOT, file)}:${index + 1}  [${words.join(', ')}]  ${line.trim()}`);
    });
  }
}

/** Columns that hold identifiers, links or contact details rather than prose. */
const NOT_PROSE = /(^|_)(id|slug|code|sku|url|email|phone|whatsapp|domain|currency|locale|status|type|key)$/;

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value))
    for (const [index, item] of value.entries()) yield* strings(item, `${path}[${index}]`);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) {
      // A JSON object's keys are labels too ("Kabel": "…"), so they are checked as well.
      yield [`${path}.${key} (label)`, key];
      yield* strings(item, `${path}.${key}`);
    }
}

async function recordsMode() {
  const { default: postgres } = await import('postgres');
  const { publicName, publicText } = await import('../../src/lib/english-content');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const sql = postgres(url, { max: 1 });
  const seen = new Set<string>();
  try {
    // Every text and JSON column of the tables the public shop reads. Prose only: ids, slugs, SKUs and
    // links are skipped, and uuid- or date-looking values never reach the detector.
    for (const table of [
      'products',
      'product_variants',
      'bundles',
      'categories',
      'brands',
      'settings',
      'storefronts',
      'storefront_products',
      'storefront_collections',
    ]) {
      let rows: Record<string, unknown>[];
      try {
        rows = await sql.unsafe(`SELECT * FROM ${table}`);
      } catch {
        continue; // table not present in this database
      }
      for (const row of rows) {
        const label = String(row.name ?? row.business_name ?? row.slug ?? row.id ?? table);
        for (const [column, value] of Object.entries(row)) {
          if (NOT_PROSE.test(column) || value == null) continue;
          for (const [path, whole] of strings(value, column)) {
           // Long copy is translated paragraph by paragraph, so it is checked that way.
           for (const text of whole.split(/\n{2,}/).map((part) => part.trim())) {
            if (path.endsWith('slug') || text.length < 3) continue;
            const words = dutchWords(text);
            if (!words.length) continue;
            const isName = column === 'name' || column === 'title_override';
            const shown = isName ? publicName(text) : publicText(text);
            const handled = shown !== text && dutchWords(shown).length === 0;
            const line = `${handled ? 'shown in English' : 'DUTCH'.padEnd(15)}  ${table}.${path} [${label}] (${words.join(', ')})`;
            if (!seen.has(line)) {
              seen.add(line);
              console.log(line);
            }
           }
          }
        }
      }
    }
    if (!seen.size) console.log('No Dutch found in stored records.');
  } finally {
    await sql.end();
  }
}

(process.argv.includes('--source') ? Promise.resolve(sourceMode()) : recordsMode()).catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
