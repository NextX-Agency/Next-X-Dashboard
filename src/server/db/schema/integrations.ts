import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Server-to-server credentials. The raw secret is never persisted. */
export const integrationCredentials = pgTable(
  'integration_credentials',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    keyId: text().notNull(),
    secretHash: text().notNull(),
    active: boolean().notNull().default(true),
    scopes: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    disabledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('integration_credentials_key_id_key').on(t.keyId),
    index('integration_credentials_active_idx').on(t.active),
  ],
);
