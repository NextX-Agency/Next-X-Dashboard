import { ClipboardCheck, ClipboardList, Coins, Package, Plus, Receipt } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';

const ACTIONS = [
  {
    href: '/pos' as Route,
    title: 'Quick sale',
    hint: 'Pick, pay, send the receipt',
    Icon: Plus,
    primary: true,
  },
  {
    href: '/sales/new',
    title: 'Full sale form',
    hint: 'Dates, deposits, drafts',
    Icon: Receipt,
  },
  {
    href: '/inventory/count' as Route,
    title: 'Count stock',
    hint: 'Count and reconcile',
    Icon: ClipboardCheck,
  },
  {
    // Opens the "Log expense" sheet straight away (see lib/use-url-sheet.ts).
    href: '/expenses?new=1' as Route,
    title: 'Log expense',
    hint: 'Money that went out',
    Icon: Coins,
  },
  { href: '/orders', title: 'Orders', hint: 'Confirm, collect, fulfil', Icon: ClipboardList },
  { href: '/items', title: 'Products', hint: 'Find, edit, publish', Icon: Package },
] as const;

/**
 * The jobs staff do every day, one click from Home, each landing on the form itself rather than a
 * list where possible. The first is the primary action and is the only filled tile; the rest are
 * quiet. Nothing here is decoration: each tile is a plain link. Seven tiles would orphan one, so
 * there are six: 2 x 3 on a phone, 3 x 2 on a tablet, one row on a wide screen.
 */
export function QuickActions() {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
      {ACTIONS.map(({ href, title, hint, Icon, ...rest }) => {
        const primary = 'primary' in rest;
        return (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex min-h-14 flex-row items-center gap-3 rounded-card border p-3 transition-colors sm:min-h-[108px] sm:flex-col sm:items-stretch sm:justify-between sm:gap-0 sm:p-4',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                primary
                  ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover'
                  : 'border-line bg-raised text-ink hover:border-accent',
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span>
                <span className="block font-bold text-[14px] sm:text-[15px]">{title}</span>
                <span
                  className={cn(
                    'block text-[12.5px] max-sm:hidden',
                    primary ? 'text-accent-fg' : 'text-ink-3',
                  )}
                >
                  {hint}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
