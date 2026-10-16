import { runAgentIntegration } from '@/server/services/agent-integration';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'capabilities',
    requiredScope: 'catalog:read',
    handler: async () => ({
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
    }),
  });
}
