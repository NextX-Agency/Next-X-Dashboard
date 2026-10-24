'use client';

import { Clock, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { formatRelative } from '@/lib/format';
import { formatPos } from '@/lib/pos/format';
import { MAX_PARKED, type ParkedCart } from '@/lib/pos/storage';

/**
 * Set a cart aside and come back to it. Carts are kept on this device (see `lib/pos/storage.ts`),
 * up to ten. Resuming while something is in the cart swaps the two, so nothing is ever lost.
 */
export function ParkedSheet({
  open,
  onOpenChange,
  parked,
  cartHasItems,
  suggestedLabel,
  onPark,
  onResume,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parked: ParkedCart[];
  cartHasItems: boolean;
  suggestedLabel: string;
  onPark: (label: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [label, setLabel] = useState('');
  const full = parked.length >= MAX_PARKED;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Parked carts"
      description={`Set a sale aside and come back to it. ${parked.length} of ${MAX_PARKED} used, kept on this device.`}
    >
      <div className="flex flex-col gap-4">
        {cartHasItems ? (
          <form
            className="flex flex-col gap-2 rounded-card border border-line bg-inset p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (full) return;
              onPark(label.trim() || suggestedLabel);
              setLabel('');
            }}
          >
            <label htmlFor="pos-park-label" className="font-medium text-[13px] text-ink">
              Park the current cart
            </label>
            <input
              id="pos-park-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={suggestedLabel}
              maxLength={40}
              autoComplete="off"
              className="h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            />
            <Button type="submit" variant="primary" disabled={full} className="self-start">
              <PauseCircle aria-hidden="true" /> Park cart
            </Button>
            {full ? (
              <p role="alert" className="text-[12px] text-warning">
                All {MAX_PARKED} places are used. Resume or delete one first.
              </p>
            ) : null}
          </form>
        ) : null}

        {parked.length === 0 ? (
          <p className="text-[13px] text-ink-3">Nothing parked.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {parked.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-card border border-line bg-raised p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-[15px] text-ink">{entry.label}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                    <span>
                      {entry.summary.units} item{entry.summary.units === 1 ? '' : 's'}
                    </span>
                    <span className="tabular">
                      {formatPos(entry.summary.totalCents, entry.summary.currency)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden="true" className="size-3" />
                      {formatRelative(new Date(entry.savedAt))}
                    </span>
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={() => onResume(entry.id)}>
                  <PlayCircle aria-hidden="true" /> Resume
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete parked cart ${entry.label}`}
                  onClick={() => onDelete(entry.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
