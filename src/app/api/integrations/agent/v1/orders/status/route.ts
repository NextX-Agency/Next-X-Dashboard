import { getAgentOrderStatus, runAgentIntegration } from '@/server/services/agent-integration';
import { invalidRequest, requiredQuery } from '../../_shared';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'orders.status',
    requiredScope: 'orders:read',
    handler: async () => {
      const orderReference = requiredQuery(request, 'orderReference');
      const customerId = requiredQuery(request, 'customerId');
      if (orderReference.length > 100) invalidRequest('Query orderReference is too long.');
      if (!/^[0-9a-f-]{36}$/i.test(customerId))
        invalidRequest('Query customerId must be a UUID.');
      return getAgentOrderStatus({ orderReference, customerId });
    },
  });
}
