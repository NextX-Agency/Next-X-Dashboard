import { z } from 'zod';
import { AgentIntegrationError } from '@/server/services/agent-integration';

export const storefrontIdSchema = z.string().uuid().optional();

export function invalidRequest(message = 'Request validation failed.'): never {
  throw new AgentIntegrationError('INVALID_REQUEST', 400, message);
}

export function requiredQuery(request: Request, name: string) {
  const value = new URL(request.url).searchParams.get(name)?.trim();
  if (!value) invalidRequest(`Query parameter "${name}" is required.`);
  return value;
}
