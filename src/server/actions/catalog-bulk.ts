'use server';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  applyAdjustment,
  type PriceAdjustment,
  priceAdjustmentProblem,
} from '@/lib/bulk-price';
import {
  buildUndoPlan,
  type ItemResult,
  matchesExpectation,
  type PriceRecord,
  type PriceTarget,
  type ProductChange,
  type ProductFields,
  type UndoPlan,
} from '@/lib/bulk-undo';
import { formatMoney } from '@/lib/money';
import { positiveMoney, uuid } from '@/lib/schemas';
import { db } from '../db/client';
import {
  categories,
  priceListItems,
  priceLists,
  products,
  productVariants,
} from '../db/schema';
import { publishabilityProblem, syncLegacyUsdPrices } from '../services/catalog-rules';
import { logActivity, type Tx } from '../services/posting';
import { ActionError, memberAction, writeAction } from './client';

/**
 * Bulk and inline catalog changes.
 *
 * Every action here runs in ONE transaction, reports a result per item (changed, already that way,
 * or skipped with a reason in words), writes the activity log, and returns what it changed (the value
 * before and after) so the screen can offer an Undo for about 30 seconds. `restoreCatalogChanges`
 * is that Undo: it puts a value back only where the item still holds what the action wrote.
 */

const MAX_ITEMS = 200;
const idList = z
  .array(uuid)
  .min(1, 'Select at least one item.')
  .max(MAX_ITEMS, `Select ${MAX_ITEMS} items or fewer at a time.`);

const priceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('list') }),
  z.object({ kind: z.literal('priceList'), priceListId: uuid }),
]);

const adjustmentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('percent'), basisPoints: z.number().int() }),
  z.object({ mode: z.literal('fixed'), deltaCents: z.number().int() }),
]);

const ROUNDING_STEPS = [1, 5, 10, 50, 100, 500, 1000] as const;
const roundToSchema = z
  .number()
  .int()
  .refine(
    (value) => (ROUNDING_STEPS as readonly number[]).includes(value),
    'Choose a rounding step.',
  );

/* ── Products: publish, unpublish, archive, category ─────────────────────── */

const productChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('publish') }),
  z.object({ type: z.literal('unpublish') }),
  z.object({ type: z.literal('archive') }),
  z.object({ type: z.literal('category'), categoryId: uuid.nullable() }),
]);

export type BulkProductResult = {
  results: ItemResult[];
  changes: ProductChange[];
  undo: UndoPlan | null;
};

type ProductRowState = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  categoryId: string | null;
};

async function lockProducts(tx: Tx, ids: string[]): Promise<Map<string, ProductRowState>> {
  // Locked in id order so two overlapping bulk changes cannot deadlock.
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      status: products.status,
      catalogPublished: products.catalogPublished,
      categoryId: products.categoryId,
    })
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(asc(products.id))
    .for('update');
  return new Map(rows.map((row) => [row.id, row]));
}

function diffOf(before: ProductFields, after: ProductFields) {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after) as (keyof ProductFields)[]) {
    diff[key] = { from: before[key], to: after[key] };
  }
  return diff;
}

async function writeProductFields(tx: Tx, id: string, after: ProductFields) {
  await tx
    .update(products)
    .set({
      ...(after.status !== undefined ? { status: after.status } : {}),
      ...(after.categoryId !== undefined ? { categoryId: after.categoryId } : {}),
      ...(after.catalogPublished !== undefined
        ? {
            catalogPublished: after.catalogPublished,
            catalogPublishedAt: after.catalogPublished ? new Date() : null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));
}

export const bulkUpdateProducts = writeAction
  .metadata({ action: 'updated', entity: 'products' })
  .inputSchema(z.object({ ids: idList, change: productChangeSchema }))
  .action(async ({ parsedInput: input, ctx }): Promise<BulkProductResult> => {
    const ids = [...new Set(input.ids)];
    return db.transaction(async (tx) => {
      if (input.change.type === 'category' && input.change.categoryId) {
        const [category] = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, input.change.categoryId))
          .limit(1);
        if (!category) throw new ActionError('That category no longer exists.');
      }

      const current = await lockProducts(tx, ids);
      const results: ItemResult[] = [];
      const changes: ProductChange[] = [];

      for (const id of ids) {
        const product = current.get(id);
        if (!product) {
          results.push({
            id,
            name: 'Unknown product',
            outcome: 'skipped',
            message: 'That product no longer exists.',
          });
          continue;
        }

        let before: ProductFields = {};
        let after: ProductFields = {};
        const change = input.change;

        if (change.type === 'publish') {
          if (product.catalogPublished) {
            results.push({
              id,
              name: product.name,
              outcome: 'unchanged',
              message: 'Already on the shop.',
            });
            continue;
          }
          const problem = await publishabilityProblem(tx, id, product.status);
          if (problem) {
            results.push({ id, name: product.name, outcome: 'skipped', message: problem });
            continue;
          }
          before = { catalogPublished: false };
          after = { catalogPublished: true };
        } else if (change.type === 'unpublish') {
          if (!product.catalogPublished) {
            results.push({
              id,
              name: product.name,
              outcome: 'unchanged',
              message: 'Not on the shop.',
            });
            continue;
          }
          before = { catalogPublished: true };
          after = { catalogPublished: false };
        } else if (change.type === 'archive') {
          if (product.status === 'archived') {
            results.push({
              id,
              name: product.name,
              outcome: 'unchanged',
              message: 'Already archived.',
            });
            continue;
          }
          // Archiving takes it off the shop too, as `setProductStatus` does: re-activating it later
          // must not put it straight back on the shop without a fresh publish check.
          before = { status: product.status, catalogPublished: product.catalogPublished };
          after = { status: 'archived', catalogPublished: false };
        } else {
          if (product.categoryId === change.categoryId) {
            results.push({
              id,
              name: product.name,
              outcome: 'unchanged',
              message: 'Already in that category.',
            });
            continue;
          }
          before = { categoryId: product.categoryId };
          after = { categoryId: change.categoryId };
        }

        await writeProductFields(tx, id, after);
        await logActivity(tx, {
          memberId: ctx.member.id,
          action:
            change.type === 'publish'
              ? 'published product to catalog'
              : change.type === 'unpublish'
                ? 'unpublished product'
                : change.type === 'archive'
                  ? 'marked product archived'
                  : 'changed product category',
          entityType: 'product',
          entityId: id,
          entityLabel: product.name,
          diff: diffOf(before, after),
        });
        results.push({ id, name: product.name, outcome: 'changed' });
        changes.push({ id, name: product.name, before, after });
      }

      return { results, changes, undo: buildUndoPlan({ products: changes }) };
    });
  });

/* ── Prices ──────────────────────────────────────────────────────────────── */

type PriceTargetInput = z.infer<typeof priceTargetSchema>;

export type PriceRowResult = {
  variantId: string;
  label: string;
  sku: string;
  outcome: 'changed' | 'skipped';
  fromCents: number | null;
  toCents: number | null;
  message?: string;
};

export type BulkPriceResult = {
  currency: 'USD' | 'SRD';
  targetLabel: string;
  rows: PriceRowResult[];
  changed: number;
  skipped: number;
  beforeCents: number;
  afterCents: number;
  records: PriceRecord[];
  undo: UndoPlan | null;
};

type Exec = Pick<typeof db, 'select' | 'execute'>;

async function resolveTarget(exec: Exec, target: PriceTargetInput) {
  if (target.kind === 'list') {
    return { currency: 'USD' as const, label: 'List price (US$)' };
  }
  const [list] = await exec
    .select({
      id: priceLists.id,
      name: priceLists.name,
      currency: priceLists.currency,
      active: priceLists.active,
    })
    .from(priceLists)
    .where(eq(priceLists.id, target.priceListId))
    .limit(1);
  if (!list) throw new ActionError('That price list no longer exists.');
  if (!list.active)
    throw new ActionError('Activate the price list before changing its prices.');
  return { currency: list.currency, label: `${list.name} (${list.currency})` };
}

async function planPrices(
  exec: Exec,
  input: {
    productIds?: string[] | undefined;
    variantIds?: string[] | undefined;
    target: PriceTargetInput;
    adjustment: PriceAdjustment;
    roundTo: number;
  },
): Promise<BulkPriceResult> {
  const problem = priceAdjustmentProblem(input.adjustment);
  if (problem) throw new ActionError(problem);
  if (!input.productIds?.length && !input.variantIds?.length) {
    throw new ActionError('Select at least one item.');
  }

  const { currency, label: targetLabel } = await resolveTarget(exec, input.target);

  const scope = input.variantIds?.length
    ? inArray(productVariants.id, input.variantIds)
    : and(
        inArray(productVariants.productId, input.productIds ?? []),
        eq(productVariants.isActive, true),
      );

  const base = exec
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      variantName: productVariants.name,
      productName: products.name,
      listPriceCents: productVariants.listPriceCents,
      itemCents: priceListItems.amountCents,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(
      priceListItems,
      input.target.kind === 'priceList'
        ? and(
            eq(priceListItems.variantId, productVariants.id),
            eq(priceListItems.priceListId, input.target.priceListId),
          )
        : sql`false`,
    )
    .where(scope)
    .orderBy(asc(products.name), asc(productVariants.position), asc(productVariants.id));
  const found = await base;
  if (found.length > 400)
    throw new ActionError('That is more than 400 variants. Select fewer products.');

  const target: PriceTarget =
    input.target.kind === 'list'
      ? { kind: 'list' }
      : { kind: 'priceList', priceListId: input.target.priceListId };

  const rows: PriceRowResult[] = [];
  const records: PriceRecord[] = [];
  let beforeCents = 0;
  let afterCents = 0;
  for (const variant of found) {
    const label = `${variant.productName} · ${variant.variantName}`;
    const current = input.target.kind === 'list' ? variant.listPriceCents : variant.itemCents;
    if (current === null || current === undefined) {
      rows.push({
        variantId: variant.id,
        label,
        sku: variant.sku,
        outcome: 'skipped',
        fromCents: null,
        toCents: null,
        message: `No price in ${targetLabel}.`,
      });
      continue;
    }
    const change = applyAdjustment(current, input.adjustment, input.roundTo);
    if (!change.ok) {
      rows.push({
        variantId: variant.id,
        label,
        sku: variant.sku,
        outcome: 'skipped',
        fromCents: current,
        toCents: null,
        message: change.reason,
      });
      continue;
    }
    rows.push({
      variantId: variant.id,
      label,
      sku: variant.sku,
      outcome: 'changed',
      fromCents: change.fromCents,
      toCents: change.toCents,
    });
    records.push({
      variantId: variant.id,
      label,
      target,
      fromCents: change.fromCents,
      toCents: change.toCents,
    });
    beforeCents += change.fromCents;
    afterCents += change.toCents;
  }

  return {
    currency,
    targetLabel,
    rows,
    changed: records.length,
    skipped: rows.length - records.length,
    beforeCents,
    afterCents,
    records,
    undo: buildUndoPlan({ prices: records }),
  };
}

/** Read-only: what a bulk price change would do, with the same arithmetic the write uses. */
export const previewBulkPrices = memberAction
  .metadata({ action: 'previewed', entity: 'prices' })
  .inputSchema(
    z.object({
      productIds: idList.optional(),
      variantIds: idList.optional(),
      target: priceTargetSchema,
      adjustment: adjustmentSchema,
      roundTo: roundToSchema,
    }),
  )
  .action(async ({ parsedInput: input }): Promise<BulkPriceResult> => {
    const plan = await planPrices(db, input);
    // A preview carries no undo and no records: nothing was written.
    return { ...plan, records: [], undo: null };
  });

async function writePrice(
  tx: Tx,
  memberId: string,
  record: PriceRecord,
  sku: string,
  currency: 'USD' | 'SRD',
  action: string,
) {
  if (record.target.kind === 'list') {
    await tx
      .update(productVariants)
      .set({ listPriceCents: record.toCents, updatedAt: new Date() })
      .where(eq(productVariants.id, record.variantId));
    await syncLegacyUsdPrices(tx, [{ id: record.variantId, amountCents: record.toCents }]);
  } else {
    await tx
      .update(priceListItems)
      .set({ amountCents: record.toCents, updatedAt: new Date() })
      .where(
        and(
          eq(priceListItems.variantId, record.variantId),
          eq(priceListItems.priceListId, record.target.priceListId),
        ),
      );
  }
  await logActivity(tx, {
    memberId,
    action,
    entityType: 'variant',
    entityId: record.variantId,
    entityLabel: sku,
    diff: {
      price: { from: record.fromCents, to: record.toCents },
      currency: { from: currency, to: currency },
      list: {
        from: record.target.kind === 'list' ? 'list' : record.target.priceListId,
        to: record.target.kind === 'list' ? 'list' : record.target.priceListId,
      },
    },
  });
}

export const bulkAdjustPrices = writeAction
  .metadata({ action: 'changed', entity: 'prices' })
  .inputSchema(
    z.object({
      productIds: idList.optional(),
      variantIds: idList.optional(),
      target: priceTargetSchema,
      adjustment: adjustmentSchema,
      roundTo: roundToSchema,
    }),
  )
  .action(async ({ parsedInput: input, ctx }): Promise<BulkPriceResult> => {
    return db.transaction(async (tx) => {
      // Lock the variants being repriced (in id order), then plan against the locked values.
      const lockIds = input.variantIds?.length
        ? input.variantIds
        : (
            await tx
              .select({ id: productVariants.id })
              .from(productVariants)
              .where(
                and(
                  inArray(productVariants.productId, input.productIds ?? []),
                  eq(productVariants.isActive, true),
                ),
              )
          ).map((row) => row.id);
      if (lockIds.length > 0) {
        await tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(inArray(productVariants.id, lockIds))
          .orderBy(asc(productVariants.id))
          .for('update');
      }

      const plan = await planPrices(tx, input);
      const skuById = new Map(plan.rows.map((row) => [row.variantId, row.sku]));
      for (const record of plan.records) {
        await writePrice(
          tx,
          ctx.member.id,
          record,
          skuById.get(record.variantId) ?? '',
          plan.currency,
          'changed price',
        );
      }
      return plan;
    });
  });

/** Inline price edit from a list row: one or several variants of one product, validated like the
 *  product form (a money amount, more than zero), written together. */
export const setVariantPrices = writeAction
  .metadata({ action: 'changed', entity: 'price' })
  .inputSchema(
    z.object({
      changes: z
        .array(z.object({ variantId: uuid, price: positiveMoney }))
        .min(1, 'Nothing to change.')
        .max(50),
    }),
  )
  .action(async ({ parsedInput: input, ctx }): Promise<BulkPriceResult> => {
    return db.transaction(async (tx) => {
      const ids = input.changes.map((change) => change.variantId);
      const found = await tx
        .select({
          id: productVariants.id,
          sku: productVariants.sku,
          variantName: productVariants.name,
          productName: products.name,
          listPriceCents: productVariants.listPriceCents,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(productVariants.id, ids))
        .orderBy(asc(productVariants.id))
        .for('update', { of: productVariants });
      const byId = new Map(found.map((row) => [row.id, row]));

      const rows: PriceRowResult[] = [];
      const records: PriceRecord[] = [];
      let beforeCents = 0;
      let afterCents = 0;
      for (const change of input.changes) {
        const variant = byId.get(change.variantId);
        if (!variant) throw new ActionError('That variant no longer exists.');
        const label = `${variant.productName} · ${variant.variantName}`;
        if (variant.listPriceCents === change.price) {
          rows.push({
            variantId: variant.id,
            label,
            sku: variant.sku,
            outcome: 'skipped',
            fromCents: variant.listPriceCents,
            toCents: null,
            message: 'The price is already that.',
          });
          continue;
        }
        const record: PriceRecord = {
          variantId: variant.id,
          label,
          target: { kind: 'list' },
          fromCents: variant.listPriceCents,
          toCents: change.price,
        };
        await writePrice(tx, ctx.member.id, record, variant.sku, 'USD', 'changed price');
        records.push(record);
        rows.push({
          variantId: variant.id,
          label,
          sku: variant.sku,
          outcome: 'changed',
          fromCents: record.fromCents,
          toCents: record.toCents,
        });
        beforeCents += record.fromCents;
        afterCents += record.toCents;
      }
      return {
        currency: 'USD',
        targetLabel: 'List price (US$)',
        rows,
        changed: records.length,
        skipped: rows.length - records.length,
        beforeCents,
        afterCents,
        records,
        undo: buildUndoPlan({ prices: records }),
      };
    });
  });

/* ── Undo ────────────────────────────────────────────────────────────────── */

const productFieldsSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  catalogPublished: z.boolean().optional(),
  categoryId: uuid.nullable().optional(),
});

export type RestoreResult = { results: ItemResult[]; restored: number; skipped: number };

export const restoreCatalogChanges = writeAction
  .metadata({ action: 'undid', entity: 'catalog changes' })
  .inputSchema(
    z.object({
      products: z
        .array(
          z.object({ id: uuid, restore: productFieldsSchema, expect: productFieldsSchema }),
        )
        .max(MAX_ITEMS),
      prices: z
        .array(
          z.object({
            variantId: uuid,
            target: priceTargetSchema,
            restoreCents: z.number().int().min(1),
            expectCents: z.number().int().min(1),
          }),
        )
        .max(400),
    }),
  )
  .action(async ({ parsedInput: input, ctx }): Promise<RestoreResult> => {
    return db.transaction(async (tx) => {
      const results: ItemResult[] = [];

      if (input.products.length > 0) {
        const current = await lockProducts(
          tx,
          input.products.map((item) => item.id),
        );
        for (const item of input.products) {
          const product = current.get(item.id);
          if (!product) {
            results.push({
              id: item.id,
              name: 'Unknown product',
              outcome: 'skipped',
              message: 'That product no longer exists.',
            });
            continue;
          }
          if (
            !matchesExpectation(
              {
                status: product.status,
                catalogPublished: product.catalogPublished,
                categoryId: product.categoryId,
              },
              item.expect,
            )
          ) {
            results.push({
              id: item.id,
              name: product.name,
              outcome: 'skipped',
              message: 'Changed again since, so it was left as it is.',
            });
            continue;
          }
          if (item.restore.catalogPublished === true) {
            const problem = await publishabilityProblem(
              tx,
              item.id,
              item.restore.status ?? product.status,
            );
            if (problem) {
              results.push({
                id: item.id,
                name: product.name,
                outcome: 'skipped',
                message: problem,
              });
              continue;
            }
          }
          await writeProductFields(tx, item.id, item.restore);
          await logActivity(tx, {
            memberId: ctx.member.id,
            action: 'undid a catalog change',
            entityType: 'product',
            entityId: item.id,
            entityLabel: product.name,
            diff: diffOf(item.expect, item.restore),
          });
          results.push({ id: item.id, name: product.name, outcome: 'changed' });
        }
      }

      if (input.prices.length > 0) {
        const ids = input.prices.map((item) => item.variantId);
        const variants = await tx
          .select({
            id: productVariants.id,
            sku: productVariants.sku,
            name: productVariants.name,
            listPriceCents: productVariants.listPriceCents,
          })
          .from(productVariants)
          .where(inArray(productVariants.id, ids))
          .orderBy(asc(productVariants.id))
          .for('update');
        const byId = new Map(variants.map((variant) => [variant.id, variant]));
        for (const item of input.prices) {
          const variant = byId.get(item.variantId);
          const name = variant ? `${variant.sku}` : 'Unknown variant';
          if (!variant) {
            results.push({
              id: item.variantId,
              name,
              outcome: 'skipped',
              message: 'That variant no longer exists.',
            });
            continue;
          }
          let currentCents: number | null = null;
          let currency: 'USD' | 'SRD' = 'USD';
          if (item.target.kind === 'list') {
            currentCents = variant.listPriceCents;
          } else {
            const [priceItem] = await tx
              .select({
                amountCents: priceListItems.amountCents,
                currency: priceLists.currency,
              })
              .from(priceListItems)
              .innerJoin(priceLists, eq(priceLists.id, priceListItems.priceListId))
              .where(
                and(
                  eq(priceListItems.variantId, item.variantId),
                  eq(priceListItems.priceListId, item.target.priceListId),
                ),
              )
              .limit(1);
            currentCents = priceItem?.amountCents ?? null;
            currency = priceItem?.currency ?? 'USD';
          }
          if (currentCents !== item.expectCents) {
            results.push({
              id: item.variantId,
              name,
              outcome: 'skipped',
              message: `The price changed again since (now ${formatMoney(currentCents ?? 0, currency)}), so it was left as it is.`,
            });
            continue;
          }
          await writePrice(
            tx,
            ctx.member.id,
            {
              variantId: item.variantId,
              label: name,
              target: item.target,
              fromCents: item.expectCents,
              toCents: item.restoreCents,
            },
            variant.sku,
            currency,
            'undid a price change',
          );
          results.push({ id: item.variantId, name, outcome: 'changed' });
        }
      }

      const restored = results.filter((result) => result.outcome === 'changed').length;
      return { results, restored, skipped: results.length - restored };
    });
  });
