'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * A titled section that folds away: the building block of the product screen on a phone, where six
 * sections would otherwise be a very long scroll.
 *
 * It is a native `<details>`, so it works before the page has loaded any JavaScript, is keyboard
 * and screen-reader friendly for free, and remembers nothing it does not need to. The summary is a
 * 48 px target. Opening it from a link (`#photos`, as the "Needs attention" list does) is handled
 * by `OpenOnHash`, so a fix link lands on the open section, not on a closed one.
 */
export function CollapsibleCard({
  id,
  title,
  hint,
  defaultOpen = false,
  action,
  bare,
  className,
  children,
}: {
  id: string;
  title: string;
  /** A one-line summary shown beside the title, useful while the section is closed. */
  hint?: ReactNode;
  defaultOpen?: boolean;
  /** Right-aligned control that stays visible while closed (a count, a link). */
  action?: ReactNode;
  /** The content brings its own panels (a form), so only the header is a card. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const open = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: 'start' });
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [id]);

  return (
    <details
      ref={ref}
      id={id}
      open={defaultOpen}
      className={cn(
        'group scroll-mt-[calc(var(--shell-top,0px)+3.5rem)]',
        !bare &&
          'rounded-card border border-line-subtle bg-raised shadow-[var(--nx-shadow-raised),inset_0_1px_0_0_var(--nx-highlight)]',
        className,
      )}
    >
      <summary
        className={cn(
          'flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden',
          'rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          bare
            ? 'border border-line-subtle bg-raised group-open:mb-3'
            : 'group-open:rounded-b-none group-open:border-line-subtle group-open:border-b',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[14px] text-ink tracking-tight">{title}</span>
          {hint ? <span className="block truncate text-[12px] text-ink-3">{hint}</span> : null}
        </span>
        {action ? <span className="shrink-0">{action}</span> : null}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="p-0">{children}</div>
    </details>
  );
}
