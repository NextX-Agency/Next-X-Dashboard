import {
  Boxes,
  CalendarClock,
  ClipboardList,
  Coins,
  FileText,
  History,
  Home,
  LayoutDashboard,
  List,
  type LucideIcon,
  MessageSquareText,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import type { Route } from 'next';

export type NavItem = {
  href: Route;
  label: string;
  Icon: LucideIcon;
  /** Shown in the command palette so an action can be found by intent rather
   *  than by the label someone happens to remember. */
  keywords?: string[];
};

export type NavGroup = {
  /** Stable key, used for the open/closed state in the sidebar. */
  id: string;
  label: string;
  Icon: LucideIcon;
  items: NavItem[];
};

/**
 * Navigation, grouped by the job being done: sell it, list it, stock it, buy it, account for it.
 *
 * Eight groups hold every page of the app. The sidebar shows the group names and opens the group you
 * are in, so a screen never carries all 28 links at once; the command palette still reaches every
 * page by name or intent. Nothing was removed when the 27 flat entries were regrouped, and **Sales**
 * (the register and its history) is now listed: before, it was reachable only through buttons.
 */
export const NAVIGATION: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    Icon: Home,
    items: [
      {
        href: '/dashboard',
        label: 'Overview',
        Icon: LayoutDashboard,
        keywords: ['dashboard', 'home', 'kpi', 'summary'],
      },
    ],
  },
  {
    id: 'sell',
    label: 'Sell',
    Icon: Plus,
    items: [
      {
        href: '/pos' as Route,
        label: 'Quick sale',
        Icon: ShoppingCart,
        keywords: ['pos', 'counter', 'till', 'checkout', 'walk-in', 'scan', 'barcode', 'sell'],
      },
      {
        href: '/sales' as Route,
        label: 'Sales',
        Icon: Receipt,
        keywords: ['register', 'record a sale', 'pos', 'walk-in', 'receipts', 'revenue'],
      },
      {
        href: '/orders' as Route,
        label: 'Orders',
        Icon: ClipboardList,
        keywords: ['customer orders', 'reservations', 'invoice', 'margin', 'fulfillment'],
      },
      { href: '/customers', label: 'Customers', Icon: Users, keywords: ['clients', 'buyers'] },
      {
        href: '/quotes',
        label: 'Requests',
        Icon: MessageSquareText,
        keywords: ['quote', 'enquiry', 'inquiry', 'storefront', 'leads'],
      },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    Icon: Package,
    items: [
      {
        href: '/items',
        label: 'Products',
        Icon: Package,
        keywords: ['sku', 'variant', 'item', 'price', 'images', 'catalog'],
      },
      {
        href: '/bundles' as Route,
        label: 'Bundles',
        Icon: Package,
        keywords: ['kits', 'packages', 'components', 'margin'],
      },
      { href: '/categories', label: 'Categories', Icon: Tags },
      {
        href: '/price-lists' as Route,
        label: 'Price lists',
        Icon: List,
        keywords: ['prices', 'currency', 'selling price'],
      },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    Icon: Boxes,
    items: [
      {
        href: '/inventory',
        label: 'Inventory',
        Icon: Boxes,
        keywords: ['stock', 'on hand', 'movements', 'low stock', 'valuation', 'adjust'],
      },
      {
        href: '/reorder' as Route,
        label: 'Reorder advice',
        Icon: ShoppingCart,
        keywords: ['forecast', 'recommendations', 'budget', 'restock'],
      },
    ],
  },
  {
    id: 'buy',
    label: 'Buy',
    Icon: Truck,
    items: [
      {
        href: '/suppliers',
        label: 'Suppliers',
        Icon: Truck,
        keywords: ['amazon', 'aliexpress'],
      },
      {
        href: '/purchase-orders',
        label: 'Purchase orders',
        Icon: ShoppingCart,
        keywords: ['po', 'buying', 'receive', 'landed cost', 'freight', 'shipping'],
      },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    Icon: Wallet,
    items: [
      {
        href: '/finance' as Route,
        label: 'Finance',
        Icon: FileText,
        keywords: ['wallets', 'transactions', 'reconciliation', 'money'],
      },
      {
        href: '/ledger',
        label: 'Cash ledger',
        Icon: Wallet,
        keywords: ['balance', 'cash', 'money in', 'money out', 'bank'],
      },
      {
        href: '/wallets' as Route,
        label: 'Wallets',
        Icon: Wallet,
        keywords: ['cash', 'bank', 'card', 'transfer'],
      },
      {
        href: '/invoices' as Route,
        label: 'Invoices',
        Icon: Receipt,
        keywords: ['receivables', 'paid', 'outstanding'],
      },
      {
        href: '/obligations' as Route,
        label: 'Obligations',
        Icon: FileText,
        keywords: ['accounts payable', 'accounts receivable', 'bills', 'settlements'],
      },
      {
        href: '/expenses',
        label: 'Expenses',
        Icon: Coins,
        keywords: ['costs', 'marketing', 'tools', 'overheads'],
      },
      {
        href: '/expenses/recurring' as Route,
        label: 'Recurring expenses',
        Icon: CalendarClock,
        keywords: ['subscriptions', 'scheduled costs', 'monthly expenses'],
      },
      {
        href: '/commissions' as Route,
        label: 'Commissions',
        Icon: Coins,
        keywords: ['sellers', 'commission rates', 'payouts', 'sales staff'],
      },
      {
        href: '/exchange-rates' as Route,
        label: 'Exchange rates',
        Icon: Coins,
        keywords: ['fx', 'usd', 'srd'],
      },
      {
        href: '/reconciliation' as Route,
        label: 'Reconciliation',
        Icon: FileText,
        keywords: ['statement', 'matching', 'bank'],
      },
    ],
  },
  {
    id: 'insight',
    label: 'Reports',
    Icon: FileText,
    items: [
      {
        href: '/reports',
        label: 'Reports',
        Icon: FileText,
        keywords: ['profit and loss', 'p&l', 'margin by product', 'fx exposure'],
      },
      {
        href: '/activity' as Route,
        label: 'Activity log',
        Icon: History,
        keywords: ['audit', 'history', 'who did what', 'changes', 'trail', 'log'],
      },
      {
        href: '/owners',
        label: 'Owners',
        Icon: Users,
        keywords: ['equity', 'capital', 'contribution', 'split', 'leonardo', 'youri'],
      },
    ],
  },
  {
    id: 'shop',
    label: 'Shop & settings',
    Icon: Store,
    items: [
      {
        href: '/storefront' as Route,
        label: 'Storefront',
        Icon: Store,
        keywords: ['catalog', 'restock', 'public site'],
      },
      {
        href: '/storefronts' as Route,
        label: 'Storefronts',
        Icon: Store,
        keywords: ['channels', 'domains', 'sales channels', 'multi-store'],
      },
      {
        href: '/settings',
        label: 'Settings',
        Icon: Settings,
        keywords: ['exchange rate', 'team', 'members', 'currency', 'storage'],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((group) => group.items);

/** Longest-prefix match, so /items/abc keeps Products lit without / matching everything. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The single most specific item for a path. `/expenses/recurring` also starts with `/expenses`, and
 * both are nav items; only the longer one should be marked current.
 */
export function activeNavItem(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.filter((item) => isActivePath(pathname, item.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

/** The group a path belongs to, so the sidebar can open it. */
export function activeNavGroup(pathname: string): NavGroup | undefined {
  const item = activeNavItem(pathname);
  return item ? NAVIGATION.find((group) => group.items.includes(item)) : undefined;
}
