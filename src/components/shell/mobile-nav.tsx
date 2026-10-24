'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  Boxes,
  LayoutDashboard,
  Menu as MenuIcon,
  Plus,
  Receipt,
  Store,
  X,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { isActivePath } from '@/lib/navigation';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

/**
 * Phone and tablet navigation: one drawer, opened from the bottom bar's "Menu" (phones) or the
 * top bar's menu button (tablets, and phone pages whose own footer replaces the bottom bar).
 *
 * The drawer is a Radix dialog, so it traps focus, closes on Escape and on a tap on the backdrop,
 * and returns focus to whatever opened it. It also closes by itself when the route changes, which
 * covers navigation that did not come from one of its own links (the command palette, a redirect).
 */

type MobileNav = { open: boolean; setOpen: (open: boolean) => void };

const MobileNavContext = createContext<MobileNav | null>(null);

export function useMobileNav(): MobileNav {
  const value = useContext(MobileNavContext);
  if (!value) throw new Error('useMobileNav must be used inside <MobileNavProvider>');
  return value;
}

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the route change is the trigger
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const value = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <MobileNavContext.Provider value={value}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 lg:hidden" />
          <Dialog.Content
            aria-describedby={undefined}
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-[min(86vw,20rem)] flex-col overscroll-contain border-line border-r bg-raised shadow-overlay lg:hidden',
              'pl-[env(safe-area-inset-left)]',
              'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:slide-out-to-left motion-safe:data-[state=open]:slide-in-from-left motion-safe:duration-200',
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-line-subtle border-b pt-[env(safe-area-inset-top)] pr-2 pl-4">
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-12 items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Wordmark />
              </Link>
              <Dialog.Close
                aria-label="Close navigation"
                className="grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>

            <Sidebar
              showBrand={false}
              className="min-h-0 flex-1"
              onNavigate={() => setOpen(false)}
            />

            <div className="flex shrink-0 flex-col gap-2 border-line-subtle border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <ThemeToggle layout="drawer" />
              <Link
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 items-center gap-2.5 rounded-control px-2.5 font-medium text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <Store aria-hidden="true" className="size-4 text-ink-4" /> View shop
              </Link>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </MobileNavContext.Provider>
  );
}

/** The top bar's menu button: tablets, and the phone pages whose own footer replaces the bottom bar. */
export function MenuButton() {
  const { setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation"
      className="app-menu-btn -ml-1.5 grid size-11 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:hidden"
    >
      <MenuIcon aria-hidden="true" className="size-5" />
    </button>
  );
}

const TABS = [
  { href: '/dashboard', label: 'Overview', Icon: LayoutDashboard },
  { href: '/sales', label: 'Sales', Icon: Receipt, exact: true },
  { href: '/pos', label: 'Sell', Icon: Plus, primary: true },
  { href: '/inventory', label: 'Inventory', Icon: Boxes },
] as const;

/**
 * The bottom bar, phones only (below `md`): the four things done all day, and the menu.
 * It slides away with the top bar while reading and steps aside for pages with their own sticky
 * footer (those carry `data-hides-tabbar`); see app/(app)/mobile.css.
 */
export function TabBar() {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();

  return (
    <nav
      aria-label="Quick links"
      className="app-tabbar fixed inset-x-0 bottom-0 z-30 border-line border-t bg-raised pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
    >
      <ul className="grid h-[3.25rem] grid-cols-5">
        {TABS.map(({ href, label, Icon, ...rest }) => {
          const primary = 'primary' in rest;
          const exact = 'exact' in rest;
          const active = exact
            ? pathname === href ||
              (pathname.startsWith(`${href}/`) && !pathname.startsWith('/sales/new'))
            : isActivePath(pathname, href);
          return (
            <li key={href} className="grid">
              <Link
                href={href as Route}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 text-[11px] leading-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  active && !primary ? 'font-semibold text-accent' : 'text-ink-3',
                  primary && 'font-semibold text-ink',
                )}
              >
                {primary ? (
                  <span className="grid h-7 w-11 place-items-center rounded-full bg-accent text-accent-fg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                ) : (
                  <Icon aria-hidden="true" className="size-5" />
                )}
                {label}
                {active && !primary ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-0.5 w-8 rounded-b-full bg-accent"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
        <li className="grid">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] text-ink-3 leading-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <MenuIcon aria-hidden="true" className="size-5" />
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
