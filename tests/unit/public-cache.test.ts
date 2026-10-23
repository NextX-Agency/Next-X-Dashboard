import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag,
  cacheLife: () => {},
  cacheTag: () => {},
}));

const requireWrite = vi.fn();
const requireOwner = vi.fn();
const requireMember = vi.fn();
vi.mock('@/server/auth', () => ({
  requireWrite,
  requireOwner,
  requireMember,
  getCurrentMember: vi.fn(),
}));

const { CACHE_TAGS, invalidatePublicData } = await import('@/server/queries/cache-tags');
const { memberAction, ownerAction, publicAction, writeAction } = await import(
  '@/server/actions/client'
);

const member = { id: 'member-1', role: 'staff' };
const input = z.object({});
const expiredTags = () => revalidateTag.mock.calls.map(([tag]) => tag).sort();
const allTags = Object.values(CACHE_TAGS).sort();

describe('public storefront cache invalidation', () => {
  beforeEach(() => {
    revalidateTag.mockReset();
    requireWrite.mockReset().mockResolvedValue(member);
    requireOwner.mockReset().mockResolvedValue(member);
    requireMember.mockReset().mockResolvedValue(member);
  });
  afterEach(() => vi.restoreAllMocks());

  it('expires every tag immediately, with no stale-while-revalidate window', () => {
    invalidatePublicData();
    expect(expiredTags()).toEqual(allTags);
    for (const call of revalidateTag.mock.calls) expect(call[1]).toEqual({ expire: 0 });
  });

  it('expires the whole public cache after any successful staff mutation', async () => {
    const action = writeAction
      .metadata({ action: 'adjusted', entity: 'stock' })
      .inputSchema(input)
      .action(async () => 'done');

    const result = await action({});
    expect(result?.data).toBe('done');
    expect(expiredTags()).toEqual(allTags);
  });

  it('expires it after an owner-only mutation too', async () => {
    const action = ownerAction
      .metadata({ action: 'updated', entity: 'settings' })
      .inputSchema(input)
      .action(async () => 'done');

    await action({});
    expect(expiredTags()).toEqual(allTags);
  });

  it('still expires it when the handler fails after possibly writing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const action = writeAction
      .metadata({ action: 'received', entity: 'purchase order' })
      .inputSchema(input)
      .action(async () => {
        throw new Error('boom after a partial write');
      });

    const result = await action({});
    expect(result?.serverError).toBeTruthy();
    expect(expiredTags()).toEqual(allTags);
  });

  it('does not run, and so does not expire anything, for a member who may not write', async () => {
    requireWrite.mockRejectedValue(new Error('read-only member'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = vi.fn(async () => 'done');
    const action = writeAction
      .metadata({ action: 'adjusted', entity: 'stock' })
      .inputSchema(input)
      .action(handler);

    await action({});
    expect(handler).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('lets neither anonymous nor read-only actions flush the cache', async () => {
    const anonymous = publicAction
      .metadata({ action: 'requested', entity: 'quote' })
      .inputSchema(input)
      .action(async () => 'done');
    const readState = memberAction
      .metadata({ action: 'read', entity: 'notification' })
      .inputSchema(input)
      .action(async () => 'done');

    await anonymous({});
    await readState({});
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('does not turn a cache failure into a failed mutation', async () => {
    revalidateTag.mockImplementation(() => {
      throw new Error('outside a request');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const action = writeAction
      .metadata({ action: 'adjusted', entity: 'stock' })
      .inputSchema(input)
      .action(async () => 'done');

    const result = await action({});
    expect(result?.data).toBe('done');
    expect(logged).toHaveBeenCalled();
  });
});

describe('cached read models', () => {
  const root = join(process.cwd(), 'src', 'server');

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    });
  }

  /** Every function body introduced by a `'use cache'` directive in src/server. */
  function cachedFunctions() {
    return sourceFiles(root).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      const parts = source.split(/^\s*'use cache';$/m);
      return parts.slice(1).map((rest) => {
        // The body runs until the next top-level declaration.
        const body =
          rest.split(/\n(?=(?:export )?(?:async )?function |export const |const )/)[0] ?? '';
        return { file: file.slice(root.length + 1), body };
      });
    });
  }

  it('finds the cached reads (guards the scan below against silently matching nothing)', () => {
    expect(cachedFunctions().length).toBeGreaterThanOrEqual(14);
  });

  it('gives every cached read an explicit lifetime and a tag a mutation expires', () => {
    for (const { file, body } of cachedFunctions()) {
      expect(body, `${file}: missing cacheLife`).toMatch(
        /cacheLife\((?:REFERENCE|LIVE)_CACHE_LIFE\)/,
      );
      expect(body, `${file}: missing cacheTag`).toMatch(/cacheTag\(CACHE_TAGS\.\w+\)/);
    }
  });

  it('never selects a cost, margin or customer column inside a cached read', () => {
    const forbidden =
      /landed_cost|reference_cost|cost_cents|value_cents|unit_cost|margin|supplier|customer|owner_id|email_address/i;
    for (const { file, body } of cachedFunctions()) {
      // Settings drop their private planning figures before they are returned (reference.ts).
      const code = body
        .split('\n')
        .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n');
      if (file.endsWith('reference.ts')) continue;
      expect(code, `${file} reads a private column`).not.toMatch(forbidden);
    }
  });

  it('keeps the planning figures out of the cached settings', () => {
    const source = readFileSync(join(root, 'queries', 'reference.ts'), 'utf8');
    const cached = source.slice(source.indexOf('async function readPublicSettings'));
    const body = cached.slice(0, cached.indexOf('\n}\n'));
    for (const field of [
      'weeklyPurchaseBudgetCents',
      'targetBundleMarginBp',
      'defaultBundleDiscountBp',
    ]) {
      expect(body).toContain(`${field}: _`);
    }
  });
});
