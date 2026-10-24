import { Boxes, Coins, type LucideIcon, Plus, Receipt, UserPlus, Zap } from 'lucide-react';
import type { Route } from 'next';

/**
 * The "+ New" menu: the five things staff start from anywhere in the dashboard.
 *
 * Data only, so the shell (top bar, bottom bar, command palette) can render it however it likes
 * without this module knowing about any of them. Each link opens the page that does the job; where
 * the page already opens its create sheet from the query string (see `lib/use-url-sheet.ts`) the link
 * carries it, so one tap lands on the form.
 */
export type QuickAction = {
  id: 'quick-sale' | 'new-sale' | 'add-stock' | 'add-expense' | 'add-customer';
  label: string;
  hint: string;
  href: Route;
  Icon: LucideIcon;
  /** Words the command palette can match besides the label. */
  keywords: string[];
};

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: 'quick-sale',
    label: 'New quick sale',
    hint: 'Touch counter: pick, pay, done',
    href: '/pos' as Route,
    Icon: Zap,
    keywords: ['pos', 'counter', 'till', 'checkout', 'walk-in', 'sell'],
  },
  {
    id: 'new-sale',
    label: 'New sale (full form)',
    hint: 'Dates, deposits, serial numbers, drafts',
    href: '/sales/new' as Route,
    Icon: Receipt,
    keywords: ['record a sale', 'invoice', 'draft', 'on account'],
  },
  {
    id: 'add-stock',
    label: 'Add stock',
    hint: 'Count, receive or write off units',
    href: '/inventory' as Route,
    Icon: Boxes,
    keywords: ['receive', 'inventory', 'adjust', 'count', 'restock'],
  },
  {
    id: 'add-expense',
    label: 'Add expense',
    hint: 'Log money that went out',
    href: '/expenses?new=1' as Route,
    Icon: Coins,
    keywords: ['cost', 'bill', 'spend', 'receipt'],
  },
  {
    id: 'add-customer',
    label: 'Add customer',
    hint: 'Name and phone',
    href: '/customers?new-customer=1' as Route,
    Icon: UserPlus,
    keywords: ['client', 'buyer', 'contact'],
  },
];

/** The icon for the "+ New" button itself. */
export const QUICK_ACTIONS_TRIGGER_ICON: LucideIcon = Plus;
