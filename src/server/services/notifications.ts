import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { notifications } from '../db/schema';

export type NotificationMetadata = Record<string, string | number | boolean | null>;

export type CreateNotificationInput = {
  memberId: string;
  type: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  dedupeKey?: string;
};

/** Trusted server-side creation boundary. There is deliberately no client
 * action for creating arbitrary notifications. */
export async function createNotification(input: CreateNotificationInput) {
  const [created] = await db
    .insert(notifications)
    .values({
      memberId: input.memberId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? {},
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({
      target: [notifications.memberId, notifications.dedupeKey],
    })
    .returning();
  return created ?? null;
}

export async function listNotificationsForMember(memberId: string, limit = 8) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.memberId, memberId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(memberId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.memberId, memberId), isNull(notifications.readAt)));
  return Number(row?.count ?? 0);
}

export async function markNotificationRead(
  memberId: string,
  notificationId: string,
): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.memberId, memberId)))
    .returning({ id: notifications.id });
  return updated.length > 0;
}

export async function markAllNotificationsRead(memberId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.memberId, memberId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
