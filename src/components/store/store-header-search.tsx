'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SHOP_PATH } from '@/lib/storefront-domain';

/**
 * Search as a plain GET to /shop?q=. It works without JavaScript and keeps the URL shareable. The
 * field starts from the current `q`, so searching again edits the last search instead of starting over.
 */
export function StoreHeaderSearch({ className }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');

  return (
    <search className={className}>
      <form
        action={SHOP_PATH}
        onSubmit={(event) => {
          event.preventDefault();
          const q = value.trim();
          router.push((q ? `${SHOP_PATH}?q=${encodeURIComponent(q)}` : SHOP_PATH) as never);
        }}
        className="relative"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-ink-3"
        />
        <input
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search products or brands"
          aria-label="Search products or brands"
          enterKeyHint="search"
          className={cn(
            'h-11 w-full rounded-[12px] border border-transparent bg-sunken pr-4 pl-11 text-[15px] text-ink',
            'placeholder:text-ink-3 focus:border-accent focus:bg-raised focus:outline-none',
          )}
        />
      </form>
    </search>
  );
}
