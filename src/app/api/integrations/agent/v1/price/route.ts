import { getAgentPrice, runAgentIntegration } from '@/server/services/agent-integration';
import { invalidRequest, requiredQuery } from '../_shared';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'price',
    requiredScope: 'pricing:read',
    handler: async () => {
      const params = new URL(request.url).searchParams;
      const variantId = requiredQuery(request, 'variantId');
      const storefrontId = params.get('storefrontId')?.trim() || undefined;
      if (!/^[0-9a-f-]{36}$/i.test(variantId))
        invalidRequest('Query variantId must be a UUID.');
      if (storefrontId && !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
        invalidRequest('Query storefrontId must be a UUID.');
      }
      return getAgentPrice({ variantId, storefrontId });
    },
  });
}
