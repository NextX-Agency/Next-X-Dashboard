import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockAgentIntegrationError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }

  const calls: { endpoint: string; scope?: string }[] = [];
  type RunnerInput = {
    endpoint: string;
    requiredScope?: string;
    handler: (principal: { id: string }, requestId: string) => Promise<unknown>;
  };
  const runAgentIntegration = vi.fn(async (input: RunnerInput) => {
    calls.push({ endpoint: input.endpoint, scope: input.requiredScope });
    try {
      const data = await input.handler({ id: 'integration-1' }, 'request-1');
      return Response.json({ data });
    } catch (error) {
      if (error instanceof MockAgentIntegrationError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }
      throw error;
    }
  });

  return {
    MockAgentIntegrationError,
    calls,
    runAgentIntegration,
    searchAgentProducts: vi.fn(async (input: unknown) => ({ input, items: [] })),
    getAgentProduct: vi.fn(async (input: unknown) => ({ input })),
    getAgentPrice: vi.fn(async (input: unknown) => ({ input })),
    getAgentStock: vi.fn(async (input: unknown) => ({ input })),
    getAgentLocations: vi.fn(async (input: unknown) => ({ input, items: [] })),
    getAgentOrderStatus: vi.fn(async (input: unknown) => ({ input })),
    openingHoursNotSupported: vi.fn(() => {
      throw new MockAgentIntegrationError(
        'OPENING_HOURS_NOT_SUPPORTED',
        501,
        'Opening hours are not configured as structured data in Nextly.',
      );
    }),
  };
});

vi.mock('@/server/services/agent-integration', () => ({
  AgentIntegrationError: mocks.MockAgentIntegrationError,
  getAgentLocations: mocks.getAgentLocations,
  getAgentOrderStatus: mocks.getAgentOrderStatus,
  getAgentPrice: mocks.getAgentPrice,
  getAgentProduct: mocks.getAgentProduct,
  getAgentStock: mocks.getAgentStock,
  openingHoursNotSupported: mocks.openingHoursNotSupported,
  runAgentIntegration: mocks.runAgentIntegration,
  searchAgentProducts: mocks.searchAgentProducts,
}));

import { GET as capabilities } from '@/app/api/integrations/agent/v1/capabilities/route';
import { GET as locations } from '@/app/api/integrations/agent/v1/locations/route';
import { GET as openingHours } from '@/app/api/integrations/agent/v1/opening-hours/route';
import { GET as orderStatus } from '@/app/api/integrations/agent/v1/orders/status/route';
import { GET as price } from '@/app/api/integrations/agent/v1/price/route';
import { GET as product } from '@/app/api/integrations/agent/v1/products/[variantId]/route';
import { GET as productSearch } from '@/app/api/integrations/agent/v1/products/search/route';
import { GET as stock } from '@/app/api/integrations/agent/v1/stock/route';

const uuid = '00000000-0000-4000-8000-000000000001';
const uuid2 = '00000000-0000-4000-8000-000000000002';

function request(path: string) {
  return new Request(`http://nextly.test/api/integrations/agent/v1${path}`);
}

describe('Customer Agent integration API contract', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    vi.clearAllMocks();
  });

  it('advertises only read capabilities and explicitly disables opening hours', async () => {
    const response = await capabilities(request('/capabilities'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        version: 'v1',
        readOnly: true,
        capabilities: {
          searchProducts: true,
          getProduct: true,
          checkStock: true,
          checkPrice: true,
          getLocations: true,
          getOpeningHours: false,
          getOrderStatus: true,
        },
      },
    });
    expect(mocks.calls[0]).toEqual({ endpoint: 'capabilities', scope: 'catalog:read' });
  });

  it('validates search limits and routes the catalog scope', async () => {
    const response = await productSearch(request('/products/search?q=cam&limit=20'));
    expect(response.status).toBe(200);
    expect(mocks.searchAgentProducts).toHaveBeenCalledWith({ query: 'cam', limit: 20 });
    expect(mocks.calls[0]).toEqual({ endpoint: 'products.search', scope: 'catalog:read' });

    const invalid = await productSearch(request('/products/search?q=cam&limit=21'));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe('INVALID_REQUEST');
  });

  it('covers product detail, price and stock contracts', async () => {
    await product(request(`/products/${uuid}?storefrontId=${uuid2}`), {
      params: Promise.resolve({ variantId: uuid }),
    });
    expect(mocks.getAgentProduct).toHaveBeenCalledWith({
      variantId: uuid,
      storefrontId: uuid2,
    });

    await price(request(`/price?variantId=${uuid}&storefrontId=${uuid2}`));
    expect(mocks.getAgentPrice).toHaveBeenCalledWith({ variantId: uuid, storefrontId: uuid2 });

    await stock(request(`/stock?variantId=${uuid}&locationId=${uuid2}`));
    expect(mocks.getAgentStock).toHaveBeenCalledWith({ variantId: uuid, locationId: uuid2 });
    expect(mocks.calls.map((call) => call.scope)).toEqual([
      'catalog:read',
      'pricing:read',
      'inventory:read',
    ]);
  });

  it('returns only active storefront locations and a stable opening-hours error', async () => {
    await locations(request(`/locations?storefrontId=${uuid}`));
    expect(mocks.getAgentLocations).toHaveBeenCalledWith({ storefrontId: uuid });

    const response = await openingHours(request(`/opening-hours?locationId=${uuid}`));
    expect(response.status).toBe(501);
    expect((await response.json()).error).toEqual({
      code: 'OPENING_HOURS_NOT_SUPPORTED',
      message: 'Opening hours are not configured as structured data in Nextly.',
    });
    expect(mocks.calls.map((call) => call.scope)).toEqual(['locations:read', 'locations:read']);
  });

  it('requires customer context for order status', async () => {
    const response = await orderStatus(request('/orders/status?orderReference=ORD-001'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_REQUEST');

    await orderStatus(request(`/orders/status?orderReference=ORD-001&customerId=${uuid}`));
    expect(mocks.getAgentOrderStatus).toHaveBeenCalledWith({
      orderReference: 'ORD-001',
      customerId: uuid,
    });
    expect(mocks.calls.at(-1)).toEqual({ endpoint: 'orders.status', scope: 'orders:read' });
  });
});
