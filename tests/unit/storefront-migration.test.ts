import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(
    new URL('../../src/server/db/migrations/0029_multi_storefront.sql', import.meta.url),
  ),
  'utf8',
);

describe('multi-storefront migration safety', () => {
  it('is additive and protects each new table with forced RLS and write policies', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.storefronts');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.price_lists');
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DROP SCHEMA/i);
    for (const table of [
      'price_lists',
      'price_list_items',
      'storefronts',
      'storefront_products',
      'storefront_locations',
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`);
      expect(migration).toContain(`private.can_write()`);
    }
  });
});
