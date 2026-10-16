import { runAgentIntegration, searchAgentProducts } from '@/server/services/agent-integration';
import { invalidRequest } from '../../_shared';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'products.search',
    requiredScope: 'catalog:read',
    handler: async () => {
      const params = new URL(request.url).searchParams;
      const query = params.get('q')?.trim() ?? '';
      const limitRaw = params.get('limit') ?? '20';
      const limit = Number(limitRaw);
      const storefrontId = params.get('storefrontId')?.trim() || undefined;
      if (query.length < 1 || query.length > 120)
        invalidRequest('Query q must be 1-120 characters.');
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        invalidRequest('Query limit must be an integer between 1 and 20.');
      }
      if (storefrontId && !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
        invalidRequest('Query storefrontId must be a UUID.');
      }
      return searchAgentProducts({ query, limit, storefrontId });
    },
  });
}
