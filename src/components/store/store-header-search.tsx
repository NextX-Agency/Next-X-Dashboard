'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { SHOP_PATH } from '@/lib/storefront-domain';

/**
 * Search as a plain GET to /shop?q=. It works without JavaScript and keeps the URL shareable. The
 * field starts from the current `q`, so searching again edits the last search instead of starting over.
 *
 * On a phone the field sits between the logo and the cart; focusing it opens it over the whole header
 * row, with a Cancel button, so typing gets the full width without a second permanent row. It is one
 * input in both states (no second field to mount), so the tap that focuses it also raises the keyboard.
 * The header stays on screen while it has focus (`StoreChrome`).
 */
export function StoreHeaderSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const closing = useRef<number | undefined>(undefined);

  const close = () => {
    window.clearTimeout(closing.current);
    setOpen(false);
    input.current?.blur();
  };

  return (
    <search
      data-open={open}
      className={cn(
        'group min-w-0 flex-1',
        // Open on a phone: cover the header row (its parent is `relative`) with a field and Cancel.
        open &&
          'max-sm:absolute max-sm:inset-0 max-sm:z-10 max-sm:flex max-sm:items-center max-sm:gap-1 max-sm:bg-base',
      )}
    >
      <form
        action={SHOP_PATH}
        onSubmit={(event) => {
          event.preventDefault();
          const q = value.trim();
          router.push((q ? `${SHOP_PATH}?q=${encodeURIComponent(q)}` : SHOP_PATH) as never);
          close();
        }}
        className="relative min-w-0 flex-1"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-3"
        />
        <input
          ref={input}
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            window.clearTimeout(closing.current);
            setOpen(true);
          }}
          onBlur={() => {
            // Not at once: a tap on Cancel must still land after the field has lost focus.
            closing.current = window.setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
          placeholder=" "
          aria-label="Search products or brands"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={cn(
            'peer h-[44px] w-full rounded-[12px] border border-transparent bg-sunken pr-4 pl-11 text-[16px] text-ink',
            'focus:border-accent focus:bg-raised focus:outline-none',
          )}
        />
        {/* The placeholder is drawn here so a phone can say "Search products" in the narrow closed
            field and the full "Search products or brands" once it has opened. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 left-11 hidden items-center truncate text-[16px] text-ink-3 peer-placeholder-shown:flex"
        >
          <span className="truncate">
            Search products
            <span className="hidden sm:inline group-data-[open=true]:inline"> or brands</span>
          </span>
        </span>
      </form>
      {open ? (
        <button
          type="button"
          onClick={close}
          className="h-[44px] shrink-0 px-3 font-semibold text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
        >
          Cancel
        </button>
      ) : null}
    </search>
  );
}
