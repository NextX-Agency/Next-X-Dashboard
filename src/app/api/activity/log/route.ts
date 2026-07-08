import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin, isAuthError } from '@/lib/apiAuth'
import { writeActivityLog } from '@/lib/serverActivityLog'
import type { ActionType, EntityType } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_ACTIONS = new Set([
  'create',
  'update',
  'delete',
  'transfer',
  'complete',
  'cancel',
  'pay',
  'receive',
])

function clampString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function isValidAction(value: unknown): value is ActionType {
  return typeof value === 'string' && VALID_ACTIONS.has(value)
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (isAuthError(authResult)) return authResult

  try {
    const body = await request.json() as Record<string, unknown>

    if (!isValidAction(body.action)) {
      return NextResponse.json({ error: 'Invalid activity action.' }, { status: 400 })
    }

    const entityType = clampString(body.entityType ?? body.entity_type, 80)
    if (!entityType) {
      return NextResponse.json({ error: 'entityType is required.' }, { status: 400 })
    }

    const operator = typeof body.operator === 'object' && body.operator
      ? body.operator as Record<string, unknown>
      : {}

    await writeActivityLog({
      action: body.action,
      entityType: entityType as EntityType,
      entityId: clampString(body.entityId ?? body.entity_id, 120),
      entityName: clampString(body.entityName ?? body.entity_name, 240),
      details: clampString(body.details, 2000),
      user: authResult,
      operator: {
        id: clampString(operator.id, 120),
        name: clampString(operator.name, 120),
        session: clampString(operator.session, 120),
        source: 'browser',
      },
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata as Prisma.InputJsonValue : undefined,
      request,
      source: 'client',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Activity log API error:', error)
    return NextResponse.json({ error: 'Failed to record activity.' }, { status: 500 })
  }
}
