'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Item, Label, Menu, Separator } from '@/components/ui/dropdown-menu';
import {
  markAllNotificationsReadAction,
  markNotificationRead,
} from '@/server/actions/notifications';

export type NotificationBellItem = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationBellItem[];
  unreadCount: number;
}) {
  const router = useRouter();
  const markOne = useAction(markNotificationRead, { onSuccess: () => router.refresh() });
  const markAll = useAction(markAllNotificationsReadAction, {
    onSuccess: () => router.refresh(),
  });

  return (
    <Menu
      contentClassName="w-[min(360px,calc(100vw-2rem))]"
      trigger={
        <button
          type="button"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          className="relative grid size-8 place-items-center rounded-control text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-fg">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      }
    >
      <Label>
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-[13px] text-ink">Notifications</p>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              onClick={() => markAll.execute({})}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : null}
        </div>
      </Label>
      <Separator />
      {notifications.length === 0 ? (
        <p className="px-2.5 py-4 text-[13px] text-ink-3">No notifications.</p>
      ) : (
        notifications.map((notification) => (
          <Item
            key={notification.id}
            onSelect={() => {
              if (!notification.readAt) markOne.execute({ id: notification.id });
            }}
          >
            <span className="min-w-0 flex-1 py-1">
              <span className="flex items-center gap-2">
                {!notification.readAt ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                ) : null}
                <span className="truncate font-medium text-ink">{notification.title}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                {notification.message}
              </span>
              <span className="mt-1 block text-[10px] text-ink-4">
                {new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
                  new Date(notification.createdAt),
                )}
              </span>
            </span>
          </Item>
        ))
      )}
    </Menu>
  );
}
