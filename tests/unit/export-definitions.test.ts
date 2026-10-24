import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPORTS, isExportEntity } from '@/lib/export-definitions';

const route = readFileSync('src/app/api/export/route.ts', 'utf8');

describe('CSV export definitions', () => {
  it('lists every export with unique, snake_case column names', () => {
    for (const [entity, definition] of Object.entries(EXPORTS)) {
      const headers: readonly string[] = definition.headers;
      expect(new Set(headers).size, entity).toBe(headers.length);
      for (const header of headers)
        expect(header, `${entity}.${header}`).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('exports the expense receipt number in its own column (it used to shift notes and ledger_posted)', () => {
    const headers: readonly string[] = EXPORTS.expenses.headers;
    expect(headers.slice(-3)).toEqual(['receipt_number', 'notes', 'ledger_posted']);
  });

  it('maps rows by header name, never by a second hand-written list', () => {
    // A hand-written key list is exactly how one column slipped out of step with its header.
    expect(route).not.toMatch(/asRows\(rows, \[/);
    for (const entity of Object.keys(EXPORTS)) {
      const accessor = entity.includes('-') ? `EXPORTS['${entity}']` : `EXPORTS.${entity}`;
      expect(route, entity).toContain(`asRows(rows, ${accessor}.headers)`);
    }
  });

  it('every column has a matching alias in its SQL', () => {
    for (const [entity, definition] of Object.entries(EXPORTS)) {
      const accessor = entity.includes('-') ? `EXPORTS['${entity}']` : `EXPORTS.${entity}`;
      const returnAt = route.indexOf(`asRows(rows, ${accessor}.headers)`);
      const caseAt = route.lastIndexOf(`case '${entity}':`, returnAt);
      const block = route.slice(caseAt, returnAt);
      for (const header of definition.headers) {
        const selected = new RegExp(`(\\bAS ${header}\\b|[ .,]${header}[,\\s])`).test(block);
        expect(selected, `${entity}.${header} is not selected by its query`).toBe(true);
      }
    }
  });

  it('only accepts known entities, not inherited object keys', () => {
    expect(isExportEntity('sales')).toBe(true);
    expect(isExportEntity('constructor')).toBe(false);
    expect(isExportEntity('__proto__')).toBe(false);
    expect(isExportEntity(null)).toBe(false);
  });
});
