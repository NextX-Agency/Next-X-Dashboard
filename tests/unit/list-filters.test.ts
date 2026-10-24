import { describe, expect, it } from 'vitest';
import { countActiveFilters, filterParamsOf } from '@/lib/list-filters';

const params = (query: string) => new URLSearchParams(query);

describe('filterParamsOf', () => {
  it('reads a select filter from its param', () => {
    expect(filterParamsOf({ param: 'status' })).toEqual(['status']);
  });

  it('reads a number range from its two params', () => {
    expect(filterParamsOf({ minParam: 'minPrice', maxParam: 'maxPrice' })).toEqual([
      'minPrice',
      'maxPrice',
    ]);
    expect(filterParamsOf({ minParam: 'minPrice' })).toEqual(['minPrice']);
  });

  it('gives a date range its from / to defaults', () => {
    expect(filterParamsOf({})).toEqual(['from', 'to']);
    expect(filterParamsOf({ fromParam: 'spentFrom', toParam: 'spentTo' })).toEqual([
      'spentFrom',
      'spentTo',
    ]);
  });
});

describe('countActiveFilters', () => {
  const controls = [['status'], ['minPrice', 'maxPrice'], ['from', 'to']];

  it('counts nothing for an empty or missing query', () => {
    expect(countActiveFilters(controls, params(''))).toBe(0);
    expect(countActiveFilters(controls, null)).toBe(0);
  });

  it('counts a control once however many of its params are set', () => {
    expect(countActiveFilters(controls, params('from=2026-01-01&to=2026-02-01'))).toBe(1);
    expect(countActiveFilters(controls, params('minPrice=10&maxPrice=20'))).toBe(1);
  });

  it('counts several different controls and ignores search, sort and paging', () => {
    expect(
      countActiveFilters(controls, params('q=aux&page=3&sort=name&status=draft&minPrice=5')),
    ).toBe(2);
  });

  it('treats an empty value as unset', () => {
    expect(countActiveFilters(controls, params('status='))).toBe(0);
  });
});
