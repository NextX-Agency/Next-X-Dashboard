import { describe, expect, it } from 'vitest';
import {
  addSavedView,
  MAX_CUSTOM_VIEWS,
  paramsOfSearch,
  parseSavedViews,
  removeSavedView,
  sameView,
  searchOfParams,
} from '@/lib/saved-views';

describe('view parameters', () => {
  it('drops paging and empty values', () => {
    expect(paramsOfSearch('stock=low-stock&page=3&perPage=50&q=')).toEqual({
      stock: 'low-stock',
    });
  });
  it('compares views regardless of the order of their parameters', () => {
    expect(sameView({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true);
    expect(sameView({ a: '1' }, { a: '2' })).toBe(false);
    expect(searchOfParams({ b: '2', a: '1' })).toBe('a=1&b=2');
  });
});

describe('saving views', () => {
  it('adds a view first and replaces one of the same name', () => {
    const first = addSavedView([], { id: '1', name: 'Cables', params: { q: 'cable' } });
    const second = addSavedView(first.views, { id: '2', name: 'cables', params: { q: 'aux' } });
    expect(second.views).toHaveLength(1);
    expect(second.views[0]?.params).toEqual({ q: 'aux' });
  });
  it('asks for a name and for something to save', () => {
    expect(addSavedView([], { id: '1', name: '  ', params: { q: 'x' } }).error).toBeTruthy();
    expect(addSavedView([], { id: '1', name: 'Empty', params: {} }).error).toBeTruthy();
  });
  it('keeps a bounded list', () => {
    let views = [] as ReturnType<typeof parseSavedViews>;
    for (let index = 0; index < MAX_CUSTOM_VIEWS; index += 1) {
      views = addSavedView(views, {
        id: String(index),
        name: `View ${index}`,
        params: { q: String(index) },
      }).views;
    }
    const over = addSavedView(views, { id: 'x', name: 'One too many', params: { q: 'x' } });
    expect(over.error).toBeTruthy();
    expect(over.views).toHaveLength(MAX_CUSTOM_VIEWS);
  });
  it('removes a view by id', () => {
    const views = [
      { id: '1', name: 'a', params: { q: 'a' } },
      { id: '2', name: 'b', params: { q: 'b' } },
    ];
    expect(removeSavedView(views, '1').map((view) => view.id)).toEqual(['2']);
  });
});

describe('parseSavedViews', () => {
  it('reads valid views and ignores damaged storage', () => {
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews('nope')).toEqual([]);
    expect(parseSavedViews('{"a":1}')).toEqual([]);
    const raw = JSON.stringify([
      { id: 'a', name: ' Low  stock ', params: { stock: 'low-stock', page: '4', x: 5 } },
      { id: 'b', name: '', params: {} },
      { name: 'no id', params: {} },
    ]);
    expect(parseSavedViews(raw)).toEqual([
      { id: 'a', name: 'Low stock', params: { stock: 'low-stock' } },
    ]);
  });
});
