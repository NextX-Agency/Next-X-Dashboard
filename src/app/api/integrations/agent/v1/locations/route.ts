import { getAgentLocations, runAgentIntegration } from '@/server/services/agent-integration';
import { invalidRequest } from '../_shared';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'locations',
    requiredScope: 'locations:read',
    handler: async () => {
      const storefrontId =
        new URL(request.url).searchParams.get('storefrontId')?.trim() || undefined;
      if (storefrontId && !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
        invalidRequest('Query storefrontId must be a UUID.');
      }
      return getAgentLocations({ storefrontId });
    },
  });
}
