'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useIsPhone, ViewportVars } from './viewport';

/**
 * Searchable picker with inline creation.
 *
 * The create option matters more than the search does. Recording a sale to a
 * walk-in customer should not mean abandoning the form, navigating to
 * Customers, creating a record and starting over — that is the friction that
 * sends people back to the spreadsheet.
 *
 * On a phone the list opens as a bottom sheet instead of a popover: a big search field, 48px rows,
 * and it rides above the on-screen keyboard. From `sm` it is the popover it always was.
 */

export type ComboboxOption = {
  value: string;
  label: string;
  /** Right-aligned detail: a SKU, stock level, price. */
  meta?: string;
  /** Second line under the label. */
  hint?: string;
  disabled?: boolean;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  emptyLabel = 'Nothing matches that.',
  onCreate,
  createLabel = 'Create',
  id,
  disabled,
  className,
  title,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** When provided, an unmatched search term offers to create a record. */
  onCreate?: (label: string) => void | Promise<void>;
  createLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Heading of the phone sheet. Defaults to the search hint without its verb ("Search customers" becomes "Customers"). */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const phone = useIsPhone();

  const selected = options.find((option) => option.value === value);
  const trimmed = query.trim();
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !exactMatch;

  const triggerClass = cn(
    'flex h-9 w-full items-center justify-between gap-2 rounded-control border border-line bg-raised px-2.5',
    'text-left text-[13px] outline-none transition-colors max-sm:h-11 max-sm:text-[16px]',
    'focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
    selected ? 'text-ink' : 'text-ink-4',
    className,
  );
  const triggerContent = (
    <>
      <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
      {selected?.meta ? (
        <span className="tabular shrink-0 text-[12px] text-ink-4">{selected.meta}</span>
      ) : null}
      <ChevronsUpDown className="size-3.5 shrink-0 text-ink-4" />
    </>
  );

  const panel = (
    <Command loop shouldFilter className="flex min-h-0 flex-1 flex-col">
      <div className="border-line-subtle border-b px-2.5 max-sm:px-4">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={searchPlaceholder}
          enterKeyHint="search"
          className="h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4 max-sm:h-12 max-sm:text-[16px]"
        />
      </div>

      <Command.List className="max-h-[260px] overflow-y-auto overscroll-contain p-1 max-sm:max-h-none max-sm:flex-1 max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {!canCreate ? (
          <Command.Empty className="px-2.5 py-6 text-center text-[12px] text-ink-4">
            {emptyLabel}
          </Command.Empty>
        ) : null}

        {options.map((option) => (
          <Command.Item
            key={option.value}
            value={`${option.label} ${option.meta ?? ''} ${option.hint ?? ''}`}
            disabled={option.disabled}
            onSelect={() => {
              onChange(option.value === value ? null : option.value);
              setOpen(false);
              setQuery('');
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] text-ink-2',
              'max-sm:min-h-12 max-sm:px-3 max-sm:py-2 max-sm:text-[15px]',
              'data-[selected=true]:bg-hover data-[selected=true]:text-ink',
              'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
            )}
          >
            <Check
              className={cn(
                'size-3.5 shrink-0',
                option.value === value ? 'text-accent' : 'text-transparent',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{option.label}</span>
              {option.hint ? (
                <span className="block truncate text-[11px] text-ink-4 max-sm:text-[12px]">
                  {option.hint}
                </span>
              ) : null}
            </span>
            {option.meta ? (
              <span className="tabular shrink-0 text-[11px] text-ink-4 max-sm:text-[12px]">
                {option.meta}
              </span>
            ) : null}
          </Command.Item>
        ))}

        {canCreate ? (
          <Command.Item
            value={`__create__${trimmed}`}
            onSelect={async () => {
              await onCreate?.(trimmed);
              setOpen(false);
              setQuery('');
            }}
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-control border-line-subtle border-t px-2.5 py-1.5 text-[13px] text-accent data-[selected=true]:bg-hover max-sm:min-h-12 max-sm:text-[15px]"
          >
            <Plus className="size-3.5 shrink-0" />
            <span className="truncate">
              {createLabel} &ldquo;{trimmed}&rdquo;
            </span>
          </Command.Item>
        ) : null}
      </Command.List>
    </Command>
  );

  if (phone) {
    return (
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger id={id} disabled={disabled} className={triggerClass}>
          {triggerContent}
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px] motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0" />
          <Dialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-[var(--vv-bottom,0px)] z-[61] flex h-[min(80dvh,var(--vv-h,100dvh))] flex-col overflow-hidden overscroll-contain rounded-t-[18px] border-line-subtle border-t bg-overlay shadow-overlay motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:slide-out-to-bottom motion-safe:data-[state=open]:slide-in-from-bottom motion-safe:duration-200"
          >
            <ViewportVars />
            <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-1 pl-4">
              <Dialog.Title className="py-2.5 font-medium text-[15px] text-ink">
                {title ?? sheetTitle(searchPlaceholder, placeholder)}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="grid size-11 place-items-center rounded-control text-ink-3 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>
            {panel}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger id={id} disabled={disabled} className={triggerClass}>
        {triggerContent}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] overflow-hidden',
            'rounded-card border border-line bg-overlay shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 duration-150',
          )}
        >
          {panel}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Search customers" becomes "Customers"; anything else falls back to the placeholder. */
function sheetTitle(searchPlaceholder: string, placeholder: string): string {
  const stripped = searchPlaceholder.replace(/^search\s+/i, '').trim();
  if (stripped && stripped !== searchPlaceholder) {
    return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }
  return placeholder;
}
