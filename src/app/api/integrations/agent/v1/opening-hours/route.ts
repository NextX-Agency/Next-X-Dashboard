import {
  openingHoursNotSupported,
  runAgentIntegration,
} from '@/server/services/agent-integration';

export async function GET(request: Request) {
  return runAgentIntegration({
    request,
    endpoint: 'opening-hours',
    requiredScope: 'locations:read',
    handler: async () => openingHoursNotSupported(),
  });
}
