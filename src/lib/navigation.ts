import {
  Boxes,
  CalendarClock,
  Coins,
  FileText,
  LayoutDashboard,
  List,
  type LucideIcon,
  MessageSquareText,
  Package,
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

export type NavGroup = { label: string; items: NavItem[] };

/**
 * Navigation, grouped by the shape of the work rather than by table.
 *
 * The order follows the operating cycle: see where you stand, decide what to
 * stock, buy it, sell it, then account for it. Someone learning the business
 * can read the sidebar top to bottom and understand how it runs.
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Overview',
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
    label: 'Catalog',
    items: [
      {
        href: '/products',
        label: 'Products',
        Icon: Package,
        keywords: ['sku', 'variant', 'item', 'price', 'images'],
      },
      {
        href: '/bundles' as Route,
        label: 'Bundles',
        Icon: Package,
        keywords: ['kits', 'packages', 'components', 'margin'],
      },
      { href: '/categories', label: 'Categories', Icon: Tags },
      {
        href: '/suppliers',
        label: 'Suppliers',
        Icon: Truck,
        keywords: ['amazon', 'aliexpress'],
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/purchase-orders',
        label: 'Purchase orders',
        Icon: ShoppingCart,
        keywords: ['po', 'buying', 'receive', 'landed cost', 'freight', 'shipping'],
      },
      {
        href: '/reorder' as Route,
        label: 'Reorder advice',
        Icon: ShoppingCart,
        keywords: ['forecast', 'recommendations', 'budget', 'restock'],
      },
      {
        href: '/inventory',
        label: 'Inventory',
        Icon: Boxes,
        keywords: ['stock', 'on hand', 'movements', 'low stock', 'valuation'],
      },
      {
        href: '/orders' as Route,
        label: 'Orders',
        Icon: Receipt,
        keywords: ['sales', 'revenue', 'invoice', 'margin', 'fulfillment'],
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
    label: 'Storefront',
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
        href: '/price-lists' as Route,
        label: 'Price lists',
        Icon: List,
        keywords: ['prices', 'currency', 'selling price'],
      },
    ],
  },
  {
    label: 'Finance',
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
      {
        href: '/expenses',
        label: 'Expenses',
        Icon: Coins,
        keywords: ['costs', 'marketing', 'tools', 'overheads'],
      },
      {
        href: '/commissions' as Route,
        label: 'Commissions',
        Icon: Coins,
        keywords: ['sellers', 'commission rates', 'payouts', 'sales staff'],
      },
      {
        href: '/expenses/recurring' as Route,
        label: 'Recurring expenses',
        Icon: CalendarClock,
        keywords: ['subscriptions', 'scheduled costs', 'monthly expenses'],
      },
      {
        href: '/owners',
        label: 'Owners',
        Icon: Users,
        keywords: ['equity', 'capital', 'contribution', 'split', 'leonardo', 'youri'],
      },
      {
        href: '/reports',
        label: 'Reports',
        Icon: FileText,
        keywords: ['profit and loss', 'p&l', 'margin by product', 'fx exposure'],
      },
    ],
  },
  {
    label: 'System',
    items: [
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

/** Longest-prefix match, so /products/abc keeps Products lit without /
 *  matching everything. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
