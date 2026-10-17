'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { activeNavGroup, activeNavItem, NAVIGATION } from '@/lib/navigation';
import { Wordmark } from './wordmark';

/**
 * Primary navigation: eight groups, with the group you are in held open.
 *
 * The earlier flat list showed 27 links at once, all at the same volume. Here a screen shows the group
 * names and one open group, so the page you need is a glance away. A group you open by hand stays open
 * until you close it. The current page is a solid pill, the only filled element in the rail.
 */
export function Sidebar({
  className,
  onNavigate,
}: {
  className?: string;
  /** Called after a link is chosen. The mobile drawer uses it to close
   *  itself, which keeps that behaviour on the interactive element rather
   *  than on a click handler bolted to a wrapping div. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const currentGroup = activeNavGroup(pathname)?.id;
  const currentItem = activeNavItem(pathname);
  // Groups the user has toggled by hand; anything absent follows the current page.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  return (
    <nav
      className={cn('flex h-full flex-col gap-4 overflow-y-auto px-3 py-4', className)}
      aria-label="Primary"
    >
      <div className="px-2">
        <Link
          href="/dashboard"
          className="inline-flex rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Wordmark />
        </Link>
      </div>

      <ul className="flex flex-col gap-0.5">
        {NAVIGATION.map((group) => {
          const single = group.items.length === 1;
          const open = toggled[group.id] ?? group.id === currentGroup;
          const GroupIcon = group.Icon;

          if (single) {
            const item = group.items[0];
            if (!item) return null;
            const active = item === currentItem;
            return (
              <li key={group.id}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-control px-2.5 font-semibold text-[13.5px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                    active ? 'bg-ink text-on-ink' : 'text-ink hover:bg-hover',
                  )}
                >
                  <GroupIcon aria-hidden="true" className="size-4 shrink-0" />
                  {group.label}
                </Link>
              </li>
            );
          }

          return (
            <li key={group.id}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`nav-${group.id}`}
                onClick={() => setToggled((state) => ({ ...state, [group.id]: !open }))}
                className={cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 font-semibold text-[13.5px] text-ink',
                  'hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                )}
              >
                <GroupIcon aria-hidden="true" className="size-4 shrink-0" />
                <span className="flex-1 truncate text-left">{group.label}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'size-3.5 text-ink-3 transition-transform',
                    open && 'rotate-180',
                  )}
                />
              </button>
              {open ? (
                <ul
                  id={`nav-${group.id}`}
                  className="mt-0.5 mb-1.5 ml-[18px] flex flex-col gap-px border-line-subtle border-l pl-2"
                >
                  {group.items.map((item) => {
                    const active = item === currentItem;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex h-8 items-center rounded-control px-2.5 text-[13px]',
                            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                            active
                              ? 'bg-ink font-semibold text-on-ink'
                              : 'text-ink-2 hover:bg-hover hover:text-ink',
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
