import type { Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { MemberProvider } from '@/components/providers/member-provider';
import { MobileNavProvider, TabBar } from '@/components/shell/mobile-nav';
import { ScrollChrome } from '@/components/shell/scroll-chrome';
import { SetupBanner } from '@/components/shell/setup-banner';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { REQUEST_ID_HEADER } from '@/lib/observability';
import { requireMember } from '@/server/auth';
import './mobile.css';
import {
  getUnreadNotificationCount,
  listNotificationsForMember,
} from '@/server/services/notifications';

/**
 * The application shell.
 *
 * Fixed 232px rail on large screens, off-canvas below. The rail is deliberately
 * narrow: this app is read at a glance and the content deserves the width.
 *
 * requireMember runs here rather than in each page, so a new route is protected
 * by existing rather than by remembering to add a guard. Server Actions still
 * authorise independently: a layout cannot protect a POST.
 */

/**
 * These routes are genuinely dynamic and say so.
 *
 * The auth check reads cookies before anything renders, which Cache Components
 * correctly refuses to prerender. Deferring it into a Suspense boundary would
 * technically restore a static shell, but it would also let a signed-in
 * non-member start rendering pages before the guard resolved. A login-gated
 * dashboard has little to gain from a prerendered shell and everything to lose
 * from a guard that runs late, so the whole segment blocks.
 *
 * The public routes (/login, /auth/error, /no-access) keep partial
 * prerendering, because those are the ones a cold visitor actually waits on.
 */
export const instant = false;

/** `cover` lets the shell reach the screen edges on a notched phone; every fixed bar pads itself
 *  with `env(safe-area-inset-*)`, and `mobile.css` explains the rest of the phone shell. */
export const viewport: Viewport = { viewportFit: 'cover' };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const requestId = (await headers()).get(REQUEST_ID_HEADER) ?? 'app-layout';
  const member = await requireMember(requestId);
  const currentMember = { fullName: member.fullName, email: member.email, role: member.role };
  const [recentNotifications, unreadNotificationCount] = await Promise.all([
    listNotificationsForMember(member.id),
    getUnreadNotificationCount(member.id),
  ]);
  const notificationItems = recentNotifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }));

  return (
    <MemberProvider member={currentMember}>
      <MobileNavProvider>
        <ScrollChrome />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-control focus:bg-raised focus:px-3 focus:py-2 focus:text-[13px] focus:text-ink focus:shadow-overlay"
        >
          Skip to content
        </a>
        <div
          lang="en"
          className="app-shell min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]"
        >
          <aside className="sticky top-0 hidden h-dvh border-line border-r bg-raised lg:block">
            <Sidebar />
          </aside>

          <div className="flex min-w-0 flex-col">
            <Topbar
              member={currentMember}
              notifications={notificationItems}
              unreadCount={unreadNotificationCount}
            />
            <SetupBanner />
            <main
              id="main"
              tabIndex={-1}
              className="flex-1 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(var(--tabbar-h)+1.5rem)] pl-[max(1rem,env(safe-area-inset-left))] lg:px-6 lg:py-6"
            >
              {children}
            </main>
          </div>
          <TabBar />
        </div>
      </MobileNavProvider>
    </MemberProvider>
  );
}
