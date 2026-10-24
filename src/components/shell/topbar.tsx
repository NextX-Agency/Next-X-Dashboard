'use client';

import { ChevronDown, LogOut, Settings, Store } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Item, Label, Menu, Separator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';
import { CommandPalette } from './command-palette';
import { MenuButton } from './mobile-nav';
import { NotificationBell, type NotificationBellItem } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

export type TopbarMember = {
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
};

const ROLE_LABEL: Record<TopbarMember['role'], string> = {
  owner: 'Owner',
  staff: 'Staff',
  viewer: 'Read only',
};

export function Topbar({
  member,
  notifications,
  unreadCount,
}: {
  member: TopbarMember;
  notifications: NotificationBellItem[];
  unreadCount: number;
}) {
  const router = useRouter();

  return (
    <header
      className={cn(
        'app-topbar sticky top-0 z-30 flex items-center gap-1.5 border-line-subtle border-b bg-base',
        // Phone: 48px (plus the notch in landscape). From `lg` the familiar 56px bar.
        'h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]',
        'lg:h-14 lg:gap-3 lg:bg-base/85 lg:px-6 lg:pt-0 lg:backdrop-blur-md',
      )}
    >
      <MenuButton />

      <div className="min-w-0 flex-1">
        <CommandPalette />
      </div>

      <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
        <Link href="/" target="_blank" rel="noopener noreferrer">
          <Store className="size-4" /> <span className="hidden sm:inline">View shop</span>
        </Link>
      </Button>

      {/* On phones the theme lives in the navigation drawer. */}
      <div className="max-md:hidden">
        <ThemeToggle />
      </div>

      <NotificationBell notifications={notifications} unreadCount={unreadCount} />

      <Menu
        contentClassName="w-56"
        trigger={
          <button
            type="button"
            aria-label="Account"
            className={cn(
              'flex h-11 min-w-11 items-center justify-center gap-2 rounded-control text-[13px] text-ink-2 sm:h-8 sm:justify-start sm:pr-1.5 sm:pl-1',
              'transition-colors hover:bg-hover hover:text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            )}
          >
            <Avatar name={member.fullName} />
            <span className="hidden sm:inline">{member.fullName}</span>
            <ChevronDown className="hidden size-3.5 text-ink-4 sm:block" />
          </button>
        }
      >
        <Label>
          <p className="truncate font-medium text-[13px] text-ink">{member.fullName}</p>
          <p className="truncate text-[11px] text-ink-4">{member.email}</p>
          <p className="mt-1 text-[11px] text-ink-3">{ROLE_LABEL[member.role]}</p>
        </Label>
        <Separator />
        <Item asChild className="sm:hidden">
          <Link href="/" target="_blank" rel="noopener noreferrer">
            <Store className="size-4 text-ink-4" /> View shop
          </Link>
        </Item>
        <Item asChild>
          <Link href="/settings">
            <Settings className="size-4 text-ink-4" /> Settings
          </Link>
        </Item>
        <Item
          onSelect={async () => {
            await createClient().auth.signOut();
            router.replace('/login');
            router.refresh();
          }}
        >
          <LogOut className="size-4 text-ink-4" /> Sign out
        </Item>
      </Menu>
    </header>
  );
}

/** Initials rather than a generated gradient blob. Two owners: they know who
 *  they are, and a fake avatar image is pure template smell. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className="tabular grid size-7 shrink-0 place-items-center rounded-full border border-line bg-inset text-[11px] text-ink-2 sm:size-6 sm:text-[10px]">
      {initials}
    </span>
  );
}
