import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { isDatabaseConfigured } from '@/lib/env';
import { toDecimalString } from '@/lib/money';
import { logServerError, requestIdFrom, withRequestId } from '@/lib/observability';
import { db } from '../db/client';
import { integrationCredentials } from '../db/schema';
import {
  getCatalogVariantForStorefront,
  searchCatalogVariantsForStorefront,
} from '../queries/catalog';
import {
  getStorefrontAvailability,
  getStorefrontById,
  getStorefrontPrice,
  listStorefrontLocations,
  resolveStorefront,
  type StorefrontRecord,
} from './storefront';

export const AGENT_SCOPES = [
  'catalog:read',
  'inventory:read',
  'pricing:read',
  'locations:read',
  'orders:read',
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

export type AgentPrincipal = {
  id: string;
  name: string;
  keyId: string;
  scopes: AgentScope[];
};

export class AgentIntegrationError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 501 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'AgentIntegrationError';
  }
}

function integrationHash(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function secureHashMatches(storedHash: string, suppliedHash: string): boolean {
  const stored = Buffer.from(storedHash, 'hex');
  const supplied = Buffer.from(suppliedHash, 'hex');
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

function parseBearerToken(request: Request): { keyId: string; secret: string } {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    throw new AgentIntegrationError(
      'UNAUTHORIZED',
      401,
      'Integration authentication required.',
    );
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (token.length < 32 || token.length > 256) {
    throw new AgentIntegrationError('UNAUTHORIZED', 401, 'Integration authentication failed.');
  }
  const separator = token.indexOf('.');
  if (
    separator < 8 ||
    separator === token.length - 1 ||
    token.indexOf('.', separator + 1) !== -1
  ) {
    throw new AgentIntegrationError('UNAUTHORIZED', 401, 'Integration authentication failed.');
  }
  const keyId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(keyId) || !/^[A-Za-z0-9_-]{24,192}$/.test(secret)) {
    throw new AgentIntegrationError('UNAUTHORIZED', 401, 'Integration authentication failed.');
  }
  return { keyId, secret };
}

function asAgentScopes(scopes: string[]): AgentScope[] {
  return scopes.filter((scope): scope is AgentScope =>
    (AGENT_SCOPES as readonly string[]).includes(scope),
  );
}

export async function authenticateAgentIntegration(
  request: Request,
  requiredScope?: AgentScope,
): Promise<AgentPrincipal> {
  if (!isDatabaseConfigured()) {
    throw new AgentIntegrationError('SERVICE_UNAVAILABLE', 503, 'Integration API unavailable.');
  }

  const { keyId, secret } = parseBearerToken(request);
  const [credential] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.keyId, keyId))
    .limit(1);

  const valid = Boolean(
    credential?.active === true &&
      secureHashMatches(credential.secretHash, integrationHash(secret)),
  );
  if (!valid || !credential) {
    throw new AgentIntegrationError('UNAUTHORIZED', 401, 'Integration authentication failed.');
  }

  const scopes = asAgentScopes(credential.scopes);
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw new AgentIntegrationError('FORBIDDEN', 403, 'Integration scope is not granted.');
  }

  await db
    .update(integrationCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(integrationCredentials.id, credential.id));

  return { id: credential.id, name: credential.name, keyId, scopes };
}

export async function runAgentIntegration<T>(input: {
  request: Request;
  endpoint: string;
  requiredScope?: AgentScope;
  handler: (principal: AgentPrincipal, requestId: string) => Promise<T>;
}): Promise<Response> {
  const requestId = requestIdFrom(input.request);
  const startedAt = performance.now();
  let principal: AgentPrincipal | undefined;
  let status = 500;

  try {
    principal = await authenticateAgentIntegration(input.request, input.requiredScope);
    const data = await input.handler(principal, requestId);
    status = 200;
    return withRequestId(
      Response.json({ data }, { headers: { 'cache-control': 'no-store' } }),
      requestId,
    );
  } catch (error) {
    if (error instanceof AgentIntegrationError) {
      status = error.status;
      return withRequestId(
        Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status, headers: { 'cache-control': 'no-store' } },
        ),
        requestId,
      );
    }
    logServerError(`integration.agent.${input.endpoint}`, requestId, error);
    return withRequestId(
      Response.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Integration request failed.' } },
        { status: 500, headers: { 'cache-control': 'no-store' } },
      ),
      requestId,
    );
  } finally {
    console.warn(
      JSON.stringify({
        scope: 'integration.agent.request',
        integrationId: principal?.id ?? null,
        endpoint: input.endpoint,
        requiredScope: input.requiredScope ?? null,
        requestId,
        status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
  }
}

export async function resolveAgentStorefront(storefrontId?: string): Promise<StorefrontRecord> {
  const storefront = storefrontId
    ? await getStorefrontById(storefrontId, true)
    : await resolveStorefront(null);
  if (!storefront) {
    throw new AgentIntegrationError('STOREFRONT_NOT_FOUND', 404, 'Storefront not found.');
  }
  return storefront;
}

export async function searchAgentProducts(input: {
  storefrontId?: string;
  query: string;
  limit: number;
}) {
  const storefront = await resolveAgentStorefront(input.storefrontId);
  return {
    storefront: {
      id: storefront.id,
      slug: storefront.slug,
      currency: storefront.defaultCurrency,
    },
    items: await searchCatalogVariantsForStorefront(storefront, input),
  };
}

export async function getAgentProduct(input: { storefrontId?: string; variantId: string }) {
  const storefront = await resolveAgentStorefront(input.storefrontId);
  const product = await getCatalogVariantForStorefront(storefront, input.variantId);
  if (!product) {
    throw new AgentIntegrationError('PRODUCT_NOT_FOUND', 404, 'Product not found.');
  }
  return product;
}

export async function getAgentPrice(input: { storefrontId?: string; variantId: string }) {
  const storefront = await resolveAgentStorefront(input.storefrontId);
  const product = await getCatalogVariantForStorefront(storefront, input.variantId);
  if (!product) {
    throw new AgentIntegrationError('PRODUCT_NOT_FOUND', 404, 'Product not found.');
  }
  const price = await getStorefrontPrice(storefront.id, input.variantId);
  if (!price) {
    throw new AgentIntegrationError('PRICE_NOT_FOUND', 404, 'Price not found.');
  }
  return {
    variantId: input.variantId,
    price: {
      amount: toDecimalString(price.amountCents, price.currency),
      currency: price.currency,
    },
  };
}

export async function getAgentStock(input: {
  storefrontId?: string;
  variantId: string;
  locationId: string;
}) {
  const storefront = await resolveAgentStorefront(input.storefrontId);
  const product = await getCatalogVariantForStorefront(storefront, input.variantId);
  if (!product) {
    throw new AgentIntegrationError('PRODUCT_NOT_FOUND', 404, 'Product not found.');
  }
  const availability = await getStorefrontAvailability(storefront.id, input.variantId);
  const location = availability.locations.find((item) => item.locationId === input.locationId);
  if (!location) {
    throw new AgentIntegrationError('LOCATION_NOT_FOUND', 404, 'Location not found.');
  }
  return {
    variantId: input.variantId,
    locationId: location.locationId,
    available: location.available,
  };
}

export async function getAgentLocations(input: { storefrontId?: string }) {
  const storefront = await resolveAgentStorefront(input.storefrontId);
  const locations = await listStorefrontLocations(storefront.id);
  return {
    storefront: { id: storefront.id, slug: storefront.slug },
    items: locations
      .filter((location) => location.active && location.assigned && location.storefrontActive)
      .sort(
        (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
      )
      .map((location) => ({ id: location.id, name: location.name, slug: location.slug })),
  };
}

export async function getAgentOrderStatus(input: {
  orderReference: string;
  customerId: string;
}) {
  const [row] = await db.execute<Record<string, string | null>>(sql`
    SELECT s.number,
           s.customer_id::text AS customer_id,
           s.workflow_status::text AS workflow_status,
           f.type::text AS fulfillment_type,
           f.status::text AS fulfillment_status,
           l.name AS location_name
      FROM sales s
      LEFT JOIN order_fulfillments f ON f.order_id = s.id
      LEFT JOIN locations l ON l.id = f.location_id
     WHERE s.number = ${input.orderReference.trim()}
       AND s.customer_id = ${input.customerId}
       AND s.status <> 'void'
     LIMIT 1
  `);
  if (!row || row.customer_id !== input.customerId) {
    throw new AgentIntegrationError('ORDER_NOT_FOUND', 404, 'Order not found.');
  }
  return {
    orderReference: String(row.number),
    status: String(row.workflow_status),
    fulfillment: row.fulfillment_type
      ? {
          type: String(row.fulfillment_type),
          status: String(row.fulfillment_status ?? 'pending'),
          locationName: row.location_name ?? null,
        }
      : null,
  };
}

export function openingHoursNotSupported(): never {
  throw new AgentIntegrationError(
    'OPENING_HOURS_NOT_SUPPORTED',
    501,
    'Opening hours are not configured as structured data in NextX Dashboard 2.0.',
  );
}

export function createIntegrationCredential(input: { name: string; scopes: AgentScope[] }) {
  const keyId = randomBytes(12).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  return db
    .insert(integrationCredentials)
    .values({
      name: input.name,
      keyId,
      secretHash: integrationHash(secret),
      scopes: input.scopes,
    })
    .returning({ id: integrationCredentials.id, keyId: integrationCredentials.keyId })
    .then(([row]) => ({ ...row, token: `${keyId}.${secret}` }));
}

export async function rotateIntegrationCredential(keyId: string) {
  const nextKeyId = randomBytes(12).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const [row] = await db
    .update(integrationCredentials)
    .set({ keyId: nextKeyId, secretHash: integrationHash(secret), rotatedAt: new Date() })
    .where(
      and(eq(integrationCredentials.keyId, keyId), eq(integrationCredentials.active, true)),
    )
    .returning({ id: integrationCredentials.id, keyId: integrationCredentials.keyId });
  if (!row) throw new Error('Active integration credential not found.');
  return { ...row, token: `${nextKeyId}.${secret}` };
}

export async function disableIntegrationCredential(keyId: string) {
  const [row] = await db
    .update(integrationCredentials)
    .set({ active: false, disabledAt: new Date() })
    .where(eq(integrationCredentials.keyId, keyId))
    .returning({ id: integrationCredentials.id, keyId: integrationCredentials.keyId });
  if (!row) throw new Error('Integration credential not found.');
  return row;
}
