/**
 * Saved views of a list: a name plus the address parameters that produce it.
 *
 * The built-in views are fixed filters ("Low stock", "No photo"...) shown as chips with a count.
 * People can also save the current filters under their own name; those live in this browser only
 * (localStorage), per list, so nothing about a person's habits is stored on the server.
 */

export type SavedView = {
  id: string;
  name: string;
  /** Address parameters, without `page`. */
  params: Record<string, string>;
};

export const MAX_CUSTOM_VIEWS = 12;
export const MAX_VIEW_NAME = 30;

/** Parameters that describe a view. Paging and the row-count setting are never part of one. */
const IGNORED_PARAMS = new Set(['page', 'perPage']);

export function paramsOfSearch(search: string | URLSearchParams): Record<string, string> {
  const source = typeof search === 'string' ? new URLSearchParams(search) : search;
  const params: Record<string, string> = {};
  for (const [key, value] of source.entries()) {
    if (IGNORED_PARAMS.has(key) || value === '') continue;
    params[key] = value;
  }
  return params;
}

export function searchOfParams(params: Record<string, string>): string {
  const sorted = Object.keys(params).sort();
  const search = new URLSearchParams();
  for (const key of sorted) search.set(key, params[key] as string);
  return search.toString();
}

/** True when two parameter sets describe the same view, whatever their order. */
export function sameView(a: Record<string, string>, b: Record<string, string>): boolean {
  return searchOfParams(a) === searchOfParams(b);
}

export function cleanViewName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_VIEW_NAME);
}

export function parseSavedViews(raw: string | null): SavedView[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const views: SavedView[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const { id, name, params } = item as Record<string, unknown>;
      if (typeof id !== 'string' || typeof name !== 'string') continue;
      if (!params || typeof params !== 'object' || Array.isArray(params)) continue;
      const clean: Record<string, string> = {};
      for (const [key, entry] of Object.entries(params)) {
        if (typeof entry === 'string' && entry !== '' && !IGNORED_PARAMS.has(key)) {
          clean[key] = entry.slice(0, 200);
        }
      }
      const viewName = cleanViewName(name);
      if (!viewName) continue;
      views.push({ id: id.slice(0, 64), name: viewName, params: clean });
    }
    return views.slice(0, MAX_CUSTOM_VIEWS);
  } catch {
    return [];
  }
}

/** Add (or replace by name) a view; the newest is kept first and the list is bounded. */
export function addSavedView(
  views: readonly SavedView[],
  view: SavedView,
): { views: SavedView[]; error?: string } {
  const name = cleanViewName(view.name);
  if (!name) return { views: [...views], error: 'Give the view a name.' };
  if (Object.keys(view.params).length === 0) {
    return {
      views: [...views],
      error: 'Choose a filter or a search first, then save the view.',
    };
  }
  const without = views.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
  if (without.length >= MAX_CUSTOM_VIEWS) {
    return {
      views: [...views],
      error: `You can keep ${MAX_CUSTOM_VIEWS} saved views. Remove one first.`,
    };
  }
  return { views: [{ ...view, name }, ...without] };
}

export function removeSavedView(views: readonly SavedView[], id: string): SavedView[] {
  return views.filter((view) => view.id !== id);
}
