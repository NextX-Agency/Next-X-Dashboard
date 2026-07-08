import { NextRequest } from 'next/server'
import { Prisma, PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { ActionType, EntityType } from '@/lib/activityLog'
import type { UserRole } from '@/lib/apiAuth'

type ActivityLogClient = PrismaClient | Prisma.TransactionClient

type ActivityActor = {
  id?: string | null
  email?: string | null
  name?: string | null
  role?: UserRole | string | null
}

type ActivityOperator = {
  id?: string | null
  name?: string | null
  session?: string | null
  source?: string | null
}

type WriteActivityLogParams = {
  action: ActionType
  entityType: EntityType
  entityId?: string | null
  entityName?: string | null
  details?: string | null
  userId?: string | null
  user?: ActivityActor | null
  operator?: ActivityOperator | null
  metadata?: Prisma.InputJsonValue | null
  request?: NextRequest
  source?: string
  client?: ActivityLogClient
}

function clamp(value: string | null | undefined, maxLength: number) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function decodeHeaderValue(value: string | null) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function hashValue(value: string | null | undefined) {
  if (!value) return null
  const salt = process.env.ACTIVITY_LOG_HASH_SALT || process.env.NEXTAUTH_SECRET || process.env.DATABASE_URL || 'nextx-activity-log'
  return createHash('sha256').update(`${salt}:${value}`).digest('hex')
}

function getRequestIp(request?: NextRequest) {
  if (!request) return null
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip') || request.headers.get('x-vercel-forwarded-for')
}

function getRequestPath(request?: NextRequest) {
  if (!request) return null
  return `${request.nextUrl.pathname}${request.nextUrl.search}`
}

function getOperatorFromRequest(request?: NextRequest): ActivityOperator {
  if (!request) return {}

  return {
    id: decodeHeaderValue(request.headers.get('x-nextx-operator-id')),
    name: decodeHeaderValue(request.headers.get('x-nextx-operator-name')),
    session: decodeHeaderValue(request.headers.get('x-nextx-operator-session')),
    source: request.headers.get('x-nextx-operator-source') || 'browser',
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = canonicalize((value as Record<string, unknown>)[key])
      return result
    }, {})
}

function buildChecksum(data: Record<string, unknown>) {
  const salt = process.env.ACTIVITY_LOG_CHECKSUM_SALT || process.env.ACTIVITY_LOG_HASH_SALT || 'nextx-activity-checksum'
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(data)))
    .update(`:${salt}`)
    .digest('hex')
}

function isMissingAuditColumnError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022') return true
  if (error instanceof Error) {
    return /column .* does not exist|Unknown arg|Unknown field|P2022/i.test(error.message)
  }
  return false
}

async function getPreviousChecksum(client: ActivityLogClient) {
  try {
    const previous = await client.activityLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { checksum: true },
    })
    return previous?.checksum ?? null
  } catch (error) {
    if (isMissingAuditColumnError(error)) return null
    throw error
  }
}

async function createLegacyActivityLog(client: ActivityLogClient, params: WriteActivityLogParams) {
  const requestOperator = getOperatorFromRequest(params.request)
  const operatorName = clamp(params.operator?.name ?? requestOperator.name, 120)
  const operatorSession = clamp(params.operator?.session ?? requestOperator.session, 120)
  const legacyDetails = [
    params.details ?? null,
    operatorName ? `Operator: ${operatorName}` : null,
    operatorSession ? `Session: ${operatorSession.slice(0, 12)}` : null,
  ].filter(Boolean).join(' | ') || null

  await client.activityLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      entityName: params.entityName ?? null,
      details: legacyDetails,
      userId: params.user?.id ?? params.userId ?? null,
    },
  })
}

export async function writeActivityLog(params: WriteActivityLogParams) {
  const client = params.client ?? prisma
  const requestOperator = getOperatorFromRequest(params.request)
  const operator = {
    id: clamp(params.operator?.id ?? requestOperator.id, 120),
    name: clamp(params.operator?.name ?? requestOperator.name, 120),
    session: clamp(params.operator?.session ?? requestOperator.session, 120),
    source: clamp(params.operator?.source ?? requestOperator.source ?? params.source ?? 'server', 40),
  }
  const actor = params.user ?? null
  const requestId = clamp(params.request?.headers.get('x-request-id') || params.request?.headers.get('x-vercel-id') || randomUUID(), 120)
  const requestPath = clamp(getRequestPath(params.request), 500)
  const requestMethod = clamp(params.request?.method, 12)
  const userAgent = params.request?.headers.get('user-agent') ?? null
  const previousChecksum = await getPreviousChecksum(client)

  const checksumData = {
    previousChecksum,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    entityName: params.entityName ?? null,
    details: params.details ?? null,
    actorUserId: actor?.id ?? params.userId ?? null,
    actorEmail: actor?.email ?? null,
    operatorId: operator.id,
    operatorName: operator.name,
    operatorSession: operator.session,
    requestId,
    requestMethod,
    requestPath,
    metadata: params.metadata ?? null,
  }

  try {
    await client.activityLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        entityName: params.entityName ?? null,
        details: params.details ?? null,
        userId: actor?.id ?? params.userId ?? null,
        actorUserId: actor?.id ?? params.userId ?? null,
        actorEmail: clamp(actor?.email, 255),
        actorName: clamp(actor?.name, 160),
        actorRole: clamp(actor?.role, 40),
        operatorId: operator.id,
        operatorName: operator.name,
        operatorSource: operator.source,
        operatorSession: operator.session,
        requestId,
        requestMethod,
        requestPath,
        source: clamp(params.source ?? 'server', 40),
        ipHash: hashValue(getRequestIp(params.request)),
        userAgentHash: hashValue(userAgent),
        metadata: params.metadata ?? undefined,
        previousChecksum,
        checksum: buildChecksum(checksumData),
      },
    })
  } catch (error) {
    if (!isMissingAuditColumnError(error)) throw error
    await createLegacyActivityLog(client, params)
  }
}
