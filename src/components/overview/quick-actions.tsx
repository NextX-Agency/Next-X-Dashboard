import { Boxes, ClipboardList, Package, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

const ACTIONS = [
  {
    href: '/sales/new',
    title: 'Record a sale',
    hint: 'Walk-in or on account',
    Icon: Plus,
    primary: true,
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
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ACTIONS.map(({ href, title, hint, Icon, ...rest }) => {
        const primary = 'primary' in rest;
        return (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                'flex min-h-[108px] flex-col justify-between rounded-card border p-4 transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                primary
                  ? 'border-ink bg-ink text-on-ink hover:opacity-90'
                  : 'border-line bg-raised text-ink hover:border-ink',
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              <span>
                <span className="block font-bold text-[15px]">{title}</span>
                <span
                  className={cn('block text-[12.5px]', primary ? 'opacity-70' : 'text-ink-3')}
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
