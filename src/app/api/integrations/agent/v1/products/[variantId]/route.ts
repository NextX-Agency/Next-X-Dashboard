import { getAgentProduct, runAgentIntegration } from '@/server/services/agent-integration';
import { invalidRequest } from '../../_shared';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> },
) {
  return runAgentIntegration({
    request,
    endpoint: 'products.detail',
    requiredScope: 'catalog:read',
    handler: async () => {
      const { variantId } = await params;
      const storefrontId =
        new URL(request.url).searchParams.get('storefrontId')?.trim() || undefined;
      if (!/^[0-9a-f-]{36}$/i.test(variantId)) invalidRequest('Path variantId must be a UUID.');
      if (storefrontId && !/^[0-9a-f-]{36}$/i.test(storefrontId)) {
        invalidRequest('Query storefrontId must be a UUID.');
      }
      return getAgentProduct({ variantId, storefrontId });
    },
  });
}
