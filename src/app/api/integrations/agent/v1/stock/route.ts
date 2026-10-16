import { getAgentStock, runAgentIntegration } from '@/server/services/agent-integration';
import { invalidRequest, requiredQuery } from '../_shared';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'stock',
    requiredScope: 'inventory:read',
    handler: async () => {
      const params = new URL(request.url).searchParams;
      const variantId = requiredQuery(request, 'variantId');
      const locationId = requiredQuery(request, 'locationId');
      const storefrontId = params.get('storefrontId')?.trim() || undefined;
      if (!/^[0-9a-f-]{36}$/i.test(variantId) || !/^[0-9a-f-]{36}$/i.test(locationId)) {
        invalidRequest('Query variantId and locationId must be UUIDs.');
      }
      if (storefrontId && !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
        invalidRequest('Query storefrontId must be a UUID.');
      }
      return getAgentStock({ variantId, locationId, storefrontId });
    },
  });
}
