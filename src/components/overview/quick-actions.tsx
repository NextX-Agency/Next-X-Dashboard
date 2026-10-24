import { Boxes, ClipboardList, Package, Plus, Receipt } from 'lucide-react';
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
  { href: '/inventory', title: 'Adjust stock', hint: 'Count, receive, write off', Icon: Boxes },
  { href: '/orders', title: 'Orders', hint: 'Confirm, collect, fulfil', Icon: ClipboardList },
  { href: '/items', title: 'Products', hint: 'Find, edit, publish', Icon: Package },
] as const;

/**
 * The four jobs staff do every day, one click from Home. The first is the primary action and is the
 * only filled tile; the rest are quiet. Nothing here is decoration: each tile is a plain link.
 */
export function QuickActions() {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
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
