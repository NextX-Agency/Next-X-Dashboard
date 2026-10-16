import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const credential = {
    id: 'integration-id',
    name: 'Customer Agent',
    keyId: 'key12345',
    secretHash: '',
    active: true,
    scopes: ['catalog:read', 'inventory:read'],
  };
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => [credential]) })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => []) })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserted.push(value);
        return {
          returning: vi.fn(async () => [{ id: 'new-id', keyId: value.keyId }]),
        };
      }),
    })),
    execute: vi.fn(async (): Promise<Record<string, string | null>[]> => []),
  };
  return { credential, db, inserted };
});

vi.mock('@/server/db/client', () => ({ db: mocks.db }));

import {
  AGENT_SCOPES,
  authenticateAgentIntegration,
  createIntegrationCredential,
  getAgentOrderStatus,
} from '@/server/services/agent-integration';

const secret = 'abcdefghijklmnopqrstuvwxyz123456';

function authRequest(token = `key12345.${secret}`) {
  return new Request('http://nextly.test/api/integrations/agent/v1/capabilities', {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('Customer Agent credential security', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'configured-for-unit-test';
    mocks.credential.secretHash = createHash('sha256').update(secret).digest('hex');
    mocks.credential.active = true;
    mocks.credential.scopes = ['catalog:read', 'inventory:read'];
    mocks.inserted.length = 0;
    vi.clearAllMocks();
  });

  it('verifies a bearer secret and enforces the required scope', async () => {
    const principal = await authenticateAgentIntegration(authRequest(), 'catalog:read');
    expect(principal).toEqual({
      id: 'integration-id',
      name: 'Customer Agent',
      keyId: 'key12345',
      scopes: ['catalog:read', 'inventory:read'],
    });
    expect(mocks.db.update).toHaveBeenCalled();

    await expect(
      authenticateAgentIntegration(authRequest(), 'pricing:read'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('does not accept invalid or disabled credentials', async () => {
    await expect(
      authenticateAgentIntegration(authRequest(`key12345.${'x'.repeat(32)}`)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    mocks.credential.active = false;
    await expect(
      authenticateAgentIntegration(authRequest(), 'catalog:read'),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('stores only a hash while provisioning a high-entropy token', async () => {
    const result = await createIntegrationCredential({
      name: 'Customer Agent',
      scopes: [...AGENT_SCOPES],
    });
    const stored = mocks.inserted[0];
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{8,64}\.[A-Za-z0-9_-]{43}$/);
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('secret');
    expect(stored?.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.scopes).toEqual([...AGENT_SCOPES]);
  });

  it('keeps order status isolated to the supplied customer context', async () => {
    mocks.db.execute.mockResolvedValueOnce([
      {
        number: 'ORD-001',
        customer_id: 'customer-a',
        workflow_status: 'ready',
        fulfillment_type: 'pickup',
        fulfillment_status: 'ready',
        location_name: 'Main',
      },
    ]);
    await expect(
      getAgentOrderStatus({ orderReference: 'ORD-001', customerId: 'customer-a' }),
    ).resolves.toMatchObject({ orderReference: 'ORD-001', status: 'ready' });

    mocks.db.execute.mockResolvedValueOnce([
      {
        number: 'ORD-001',
        customer_id: 'customer-a',
        workflow_status: 'ready',
        fulfillment_type: 'pickup',
        fulfillment_status: 'ready',
        location_name: 'Main',
      },
    ]);
    await expect(
      getAgentOrderStatus({ orderReference: 'ORD-001', customerId: 'customer-b' }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });
});
