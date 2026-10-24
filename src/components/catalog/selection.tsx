'use client';

import { Check, ListChecks, X } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MobileRow } from '@/components/ui/mobile-list';
import { cn } from '@/lib/cn';

/**
 * Multi-select for the product and inventory lists.
 *
 * The page (a server component) hands the rows of the current page to `SelectionProvider` as plain
 * data; the checkboxes, the long-press on a phone row and the bulk bar all read the same context, so
 * none of them needs to know about the others. Selection belongs to the page being shown: ids that
 * are no longer on it are ignored.
 *
 * On a phone, press and hold a row (or use the Select button) to start selecting; while selecting, a
 * tap toggles the row instead of opening it, and the bulk bar replaces the bottom navigation. From
 * `lg` the table has a checkbox column.
 */

/** What a bulk action needs to know about one row. All plain, serialisable values. */
export type SelectableItem = {
  id: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  /** Products: what a publish could trip over, so the confirmation can warn before the server says no. */
  status?: 'draft' | 'active' | 'archived';
  published?: boolean;
  imageCount?: number;
  /** Variants (inventory): the product the variant belongs to. */
  productId?: string;
  /** The row as a flat record, for "Export selection". */
  csv: Record<string, string | number | null>;
};

type SelectionValue = {
  items: SelectableItem[];
  selected: ReadonlySet<string>;
  selectedItems: SelectableItem[];
  mode: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  /** Start selecting, optionally with one row already chosen. */
  enter: (id?: string) => void;
  exit: () => void;
};

const SelectionContext = createContext<SelectionValue | null>(null);

export function useSelection(): SelectionValue {
  const value = use(SelectionContext);
  if (!value) throw new Error('useSelection must be used inside SelectionProvider.');
  return value;
}

export function SelectionProvider({
  items,
  children,
}: {
  items: SelectableItem[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [mode, setMode] = useState(false);

  const present = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  // Only ids still on this page count; the rest are stale after a filter, sort or page change.
  const live = useMemo(
    () => new Set([...selected].filter((id) => present.has(id))),
    [selected, present],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo<SelectionValue>(
    () => ({
      items,
      selected: live,
      selectedItems: items.filter((item) => live.has(item.id)),
      mode,
      isSelected: (id) => live.has(id),
      toggle,
      selectAll: () => {
        setSelected(new Set(items.map((item) => item.id)));
        setMode(true);
      },
      clear: () => setSelected(new Set()),
      enter: (id) => {
        setMode(true);
        if (id) setSelected((current) => new Set(current).add(id));
      },
      exit: () => {
        setMode(false);
        setSelected(new Set());
      },
    }),
    [items, live, mode, toggle],
  );

  // Escape leaves selection mode.
  useEffect(() => {
    if (!mode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) value.exit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, value]);

  return <SelectionContext value={value}>{children}</SelectionContext>;
}

/** A 44 px target around a real checkbox. `name` is the row's name, for the accessible label. */
export function SelectionCheckbox({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const { isSelected, toggle } = useSelection();
  return (
    <label
      data-no-open
      className={cn(
        'relative -m-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-control lg:m-0 lg:size-8',
        'hover:bg-hover focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={isSelected(id)}
        onChange={() => toggle(id)}
        aria-label={`Select ${name}`}
        className="size-[18px] cursor-pointer accent-[var(--nx-accent)]"
      />
    </label>
  );
}

/** Header checkbox of the table: all rows on this page, none, or some. */
export function SelectAllCheckbox() {
  const { items, selected, selectAll, clear } = useSelection();
  const ref = useRef<HTMLInputElement>(null);
  const all = items.length > 0 && selected.size === items.length;
  const some = selected.size > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <label className="relative grid size-8 cursor-pointer place-items-center rounded-control hover:bg-hover focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        onChange={() => (all || some ? clear() : selectAll())}
        aria-label={all ? 'Clear selection' : 'Select every row on this page'}
        className="size-[18px] cursor-pointer accent-[var(--nx-accent)]"
      />
    </label>
  );
}

/** Phone: switches selection on and off without needing to know about long-press. */
export function SelectModeButton({ className }: { className?: string }) {
  const { mode, enter, exit, items } = useSelection();
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => (mode ? exit() : enter())}
      aria-pressed={mode}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-line bg-raised px-3 text-[13px] text-ink transition-colors',
        'hover:border-line-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        mode && 'border-accent-border bg-accent-muted text-accent',
        className,
      )}
    >
      {mode ? (
        <X aria-hidden="true" className="size-4" />
      ) : (
        <ListChecks aria-hidden="true" className="size-4" />
      )}
      {mode ? 'Done' : 'Select'}
    </button>
  );
}

const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;

/**
 * A stacked row of the phone list that can be selected. A long press starts selecting; while
 * selecting, a tap anywhere on the row (except its own menu) toggles it instead of opening it.
 */
export function SelectableMobileRow({
  id,
  name,
  children,
  className,
  ...props
}: {
  id: string;
  name: string;
} & Omit<ComponentProps<typeof MobileRow>, 'id'>) {
  const { mode, isSelected, toggle, enter } = useSelection();
  const selected = isSelected(id);
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  const onPointerDown = (event: ReactPointerEvent<HTMLLIElement>) => {
    if (event.pointerType === 'mouse' || mode) return;
    if ((event.target as HTMLElement).closest('[data-row-actions], [data-no-select]')) return;
    origin.current = { x: event.clientX, y: event.clientY };
    timer.current = window.setTimeout(() => {
      timer.current = null;
      swallowClick.current = true;
      // If the finger lifts without a click following, do not swallow the next real tap.
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 900);
      enter(id);
      if ('vibrate' in navigator) navigator.vibrate(12);
    }, HOLD_MS);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLLIElement>) => {
    const start = origin.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancel();
  };

  return (
    <MobileRow
      {...props}
      data-selected={selected ? '' : undefined}
      className={cn(
        // A touch screen's own press-and-hold menu and text selection would fight the long press.
        'max-lg:[-webkit-touch-callout:none] max-lg:select-none',
        mode && 'pl-14',
        selected && 'bg-accent-muted/50',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        if (timer.current !== null || swallowClick.current || mode) event.preventDefault();
      }}
      onClickCapture={(event) => {
        if (swallowClick.current) {
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!mode) return;
        if ((event.target as HTMLElement).closest('[data-row-actions], [data-no-select]'))
          return;
        event.preventDefault();
        event.stopPropagation();
        toggle(id);
      }}
    >
      {children}
      {mode ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute top-4 left-4 grid size-6 place-items-center rounded-full border-2',
            selected
              ? 'border-accent bg-accent text-accent-fg'
              : 'border-line-strong bg-raised',
          )}
        >
          {selected ? <Check className="size-3.5" /> : null}
        </span>
      ) : null}
      {mode ? <span className="sr-only">{selected ? `${name}, selected` : name}</span> : null}
    </MobileRow>
  );
}
