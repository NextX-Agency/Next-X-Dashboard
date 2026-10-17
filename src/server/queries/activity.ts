import { type SQL, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { likeContains } from '@/lib/like';
import { db } from '../db/client';
import { maybe, text } from './row';

/**
 * The audit trail every Server Action writes to (`logActivity`,
 * `services/posting.ts`). Two readers: a document's detail page asks "what
 * happened to this record", and the Overview's Recent activity panel asks
 * "what happened at all".
 */

export type ActivityEntry = {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  createdAt: string;
};

export async function listActivity({
  entityType,
  entityId,
  limit = 50,
}: {
  entityType?: string;
  entityId?: string;
  limit?: number;
}): Promise<ActivityEntry[]> {
  if (!isDatabaseConfigured()) return [];

  const conditions: SQL[] = [];
  if (entityType) conditions.push(sql`a.entity_type = ${entityType}`);
  if (entityId) conditions.push(sql`a.entity_id = ${entityId}`);
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const rows = await db.execute<Record<string, string | null>>(sql`
    SELECT a.id, a.action, a.entity_type, a.entity_id::text, a.entity_label,
           a.created_at::text, m.full_name AS actor_name
      FROM activity_logs a
      LEFT JOIN members m ON m.id = a.actor_id
      ${where}
     ORDER BY a.created_at DESC
     LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: text(row.id),
    action: text(row.action),
    actorName: maybe(row.actor_name),
    entityType: text(row.entity_type),
    entityId: maybe(row.entity_id),
    entityLabel: maybe(row.entity_label),
    createdAt: text(row.created_at),
  }));
}

export type ActivityPageEntry = ActivityEntry & {
  /** Fields that changed, as the action recorded them. Null when nothing was captured. */
  diff: Record<string, { from: unknown; to: unknown }> | null;
};

/** One page of the whole audit trail, newest first, for the owner-only Activity page. */
export async function listActivityPage({
  page,
  perPage,
  entityType,
  q,
}: {
  page: number;
  perPage: number;
  entityType?: string;
  q?: string;
}): Promise<{ rows: ActivityPageEntry[]; total: number }> {
  if (!isDatabaseConfigured()) return { rows: [], total: 0 };

  const conditions: SQL[] = [];
  if (entityType) conditions.push(sql`a.entity_type = ${entityType}`);
  if (q) {
    const like = likeContains(q);
    conditions.push(
      sql`(a.action ILIKE ${like} OR a.entity_label ILIKE ${like} OR m.full_name ILIKE ${like})`,
    );
  }
  const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

  const [rows, totals] = await Promise.all([
    db.execute<Record<string, string | null>>(sql`
      SELECT a.id, a.action, a.entity_type, a.entity_id::text, a.entity_label,
             a.created_at::text, m.full_name AS actor_name, a.diff::text AS diff
        FROM activity_logs a
        LEFT JOIN members m ON m.id = a.actor_id
        ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
    `),
    db.execute<Record<string, string | null>>(sql`
      SELECT COUNT(*)::text AS total
        FROM activity_logs a
        LEFT JOIN members m ON m.id = a.actor_id
        ${where}
    `),
  ]);

  return {
    total: Number(totals[0]?.total ?? 0),
    rows: rows.map((row) => {
      let diff: ActivityPageEntry['diff'] = null;
      try {
        const parsed: unknown = row.diff ? JSON.parse(row.diff) : null;
        if (parsed && typeof parsed === 'object') diff = parsed as ActivityPageEntry['diff'];
      } catch {
        diff = null;
      }
      return {
        id: text(row.id),
        action: text(row.action),
        actorName: maybe(row.actor_name),
        entityType: text(row.entity_type),
        entityId: maybe(row.entity_id),
        entityLabel: maybe(row.entity_label),
        createdAt: text(row.created_at),
        diff,
      };
    }),
  };
}

/** The kinds of record that appear in the trail, for the filter. */
export async function listActivityEntityTypes(): Promise<string[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await db.execute<Record<string, string | null>>(
    sql`SELECT DISTINCT entity_type FROM activity_logs ORDER BY entity_type`,
  );
  return rows.map((row) => text(row.entity_type));
}
