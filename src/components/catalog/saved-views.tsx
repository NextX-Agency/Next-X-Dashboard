'use client';

import { BookmarkPlus, X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { type ReactNode, useCallback, useId, useState, useSyncExternalStore } from 'react';
import { QuickPanel } from '@/components/catalog/quick-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import type { BuiltInView } from '@/lib/catalog-views';
import { cn } from '@/lib/cn';
import {
  addSavedView,
  paramsOfSearch,
  parseSavedViews,
  removeSavedView,
  type SavedView,
  sameView,
  searchOfParams,
} from '@/lib/saved-views';

/**
 * Quick views of a list, as a row of chips with counts.
 *
 * The built-in views ("Low stock", "No photo"...) are fixed filters whose counts the server worked
 * out with the list's own conditions. Anyone can also save the current search and filters under a
 * name; those live in this browser only (localStorage, one list per key), so a phone and a desktop
 * keep their own and nothing about habits is stored on the server.
 */

const CHANGE_EVENT = 'nx-saved-views';

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

function useStoredViews(key: string): {
  views: SavedView[];
  save: (next: SavedView[]) => void;
} {
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const views = parseSavedViews(raw);
  const save = useCallback(
    (next: SavedView[]) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private windows and blocked storage: the view simply is not remembered.
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );
  return { views, save };
}

/** The part of the address that says WHICH rows, as opposed to how they are ordered or paged. */
const ORDERING = new Set(['sort', 'dir', 'q']);

export function SavedViews({
  storageKey,
  basePath,
  builtIn,
  counts,
  allCount,
  trailing,
}: {
  storageKey: string;
  basePath: '/items' | '/inventory';
  builtIn: BuiltInView[];
  counts: Record<string, number>;
  allCount: number;
  /** Extra chip-like links after the views, e.g. "Needs attention". */
  trailing?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const { views, save } = useStoredViews(storageKey);
  const current = paramsOfSearch(searchParams);
  const filters = Object.fromEntries(
    Object.entries(current).filter(([key]) => !ORDERING.has(key)),
  );
  const hasFilters = Object.keys(filters).length > 0;
  const matchesBuiltIn = builtIn.some((view) => sameView(filters, view.params));
  const matchesCustom = views.some((view) => sameView(current, view.params));
  const canSave =
    Object.keys(current).length > 0 && !matchesCustom && !(matchesBuiltIn && !current.q);

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const formId = useId();

  const hrefFor = (params: Record<string, string>) =>
    (Object.keys(params).length > 0
      ? `${basePath}?${searchOfParams(params)}`
      : basePath) as Route;

  return (
    <nav aria-label="Saved views" className="nx-scrollx border-line-subtle border-b">
      <ul className="flex items-center gap-2 overflow-x-auto px-2 py-2 md:px-3">
        <li>
          <Chip href={hrefFor({})} active={!hasFilters && !matchesCustom} count={allCount}>
            All
          </Chip>
        </li>
        {builtIn.map((view) => (
          <li key={view.key}>
            <Chip
              href={hrefFor(view.params)}
              active={sameView(filters, view.params) && !matchesCustom}
              count={counts[view.key] ?? 0}
              title={view.hint}
            >
              {view.label}
            </Chip>
          </li>
        ))}
        {views.map((view) => (
          <li key={view.id} className="flex items-center">
            <Chip
              href={hrefFor(view.params)}
              active={sameView(current, view.params)}
              className="rounded-r-none border-r-0 pr-2"
            >
              {view.name}
            </Chip>
            <button
              type="button"
              aria-label={`Remove saved view ${view.name}`}
              onClick={() => save(removeSavedView(views, view.id))}
              className={cn(
                'grid h-11 w-9 place-items-center rounded-r-full border border-line bg-raised text-ink-4 sm:h-8 sm:w-7',
                'hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              )}
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        ))}
        {trailing ? <li className="flex items-center">{trailing}</li> : null}
        {canSave ? (
          <li>
            <QuickPanel
              open={saving}
              onOpenChange={(next) => {
                setSaving(next);
                if (next) {
                  setName('');
                  setError(null);
                }
              }}
              title="Save this view"
              description="Remembers this search, filter and order on this device."
              trigger={(props) => (
                <button
                  type="button"
                  {...props}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 text-[13px] text-ink-3 sm:h-8',
                    'hover:border-accent-border hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                  )}
                >
                  <BookmarkPlus aria-hidden="true" className="size-4" /> Save view
                </button>
              )}
              footer={
                <>
                  <Button type="button" variant="ghost" onClick={() => setSaving(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" form={formId} variant="primary">
                    Save view
                  </Button>
                </>
              }
            >
              <form
                id={formId}
                onSubmit={(event) => {
                  event.preventDefault();
                  const result = addSavedView(views, {
                    id: crypto.randomUUID(),
                    name,
                    params: current,
                  });
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  save(result.views);
                  setSaving(false);
                }}
              >
                <label htmlFor={`${formId}-name`} className="mb-1 block text-[12px] text-ink-3">
                  Name
                </label>
                <Input
                  id={`${formId}-name`}
                  autoFocus
                  autoComplete="off"
                  maxLength={30}
                  placeholder="Cables with no cost"
                  value={name}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => setName(event.target.value)}
                />
                {error ? (
                  <p role="alert" className="mt-2 text-[13px] text-negative">
                    {error}
                  </p>
                ) : null}
              </form>
            </QuickPanel>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function Chip({
  href,
  active,
  count,
  title,
  className,
  children,
}: {
  href: Route;
  active: boolean;
  count?: number;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? 'true' : undefined}
      scroll={false}
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors sm:h-8',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
        active
          ? 'border-accent-border bg-accent-muted text-accent'
          : 'border-line bg-raised text-ink-2 hover:border-line-strong hover:bg-hover',
        className,
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            'tabular grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px]',
            active
              ? 'bg-accent text-accent-fg'
              : count > 0
                ? 'bg-inset text-ink-2'
                : 'text-ink-4',
          )}
        >
          {count}
          <span className="sr-only"> matching</span>
        </span>
      ) : null}
    </Link>
  );
}
