import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Tabs between the views of one subject (Expenses: the entries, the schedules that create them).
 * Each tab is its own address, so the views bookmark and reload like any other page.
 */
export function PageTabs({
  tabs,
  current,
  label,
}: {
  tabs: { href: Route; label: string }[];
  current: Route;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="-mt-1 mb-3 flex gap-1 border-line-subtle border-b sm:mb-4"
    >
      {tabs.map((tab) => {
        const active = tab.href === current;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px flex min-h-11 items-center border-b-2 px-3 font-medium text-[13px] sm:min-h-9',
              'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px]',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-3 hover:border-line hover:text-ink',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const EXPENSE_TABS = [
  { href: '/expenses' as Route, label: 'Expenses' },
  { href: '/expenses/recurring' as Route, label: 'Recurring schedules' },
];
