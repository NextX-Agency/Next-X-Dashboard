import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { members } from './identity';

/**
 * A persisted in-app notification owned by one signed-in Nextly member.
 * Metadata is for safe references such as orderId or locationId, not secrets.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    title: text().notNull(),
    message: text().notNull(),
    metadata: jsonb()
      .$type<Record<string, string | number | boolean | null>>()
      .notNull()
      .default({}),
    dedupeKey: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_member_created_idx').on(t.memberId, t.createdAt.desc()),
    index('notifications_member_unread_idx').on(t.memberId, t.readAt, t.createdAt.desc()),
    uniqueIndex('notifications_member_dedupe_key').on(t.memberId, t.dedupeKey),
  ],
);
