import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '@/lib/apiAuth'
import { hashPassword } from '@/lib/passwords'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

const ALLOWED_ROLES = ['admin', 'seller', 'staff', 'user'] as const

function isRole(value: unknown): value is typeof ALLOWED_ROLES[number] {
  return typeof value === 'string' && (ALLOWED_ROLES as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  const [users, locations] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
        sellerProfile: { select: { id: true, name: true } },
        locationAccess: { select: { locationId: true, canManageWallet: true, location: { select: { name: true } } } },
      },
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
    }),
    prisma.location.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return NextResponse.json({ data: {
    users: users.map((user) => ({
      ...user,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt?.toISOString() ?? null,
    })),
    locations,
  } })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await request.json() as Record<string, unknown>
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const role = body.role
    const locationIds = Array.isArray(body.locationIds)
      ? Array.from(new Set(body.locationIds.filter((locationId): locationId is string => typeof locationId === 'string' && locationId.length > 0)))
      : []

    if (!email || !email.includes('@') || !name || !isRole(role)) {
      return NextResponse.json({ error: 'Name, valid email, and role are required.' }, { status: 400 })
    }
    if (password.length < 12) {
      return NextResponse.json({ error: 'Set a temporary password with at least 12 characters.' }, { status: 400 })
    }
    if (role === 'seller' && locationIds.length === 0) {
      return NextResponse.json({ error: 'A seller must be assigned to at least one location.' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const result = await prisma.$transaction(async (tx) => {
      if (locationIds.length) {
        const locationCount = await tx.location.count({ where: { id: { in: locationIds }, is_active: true } })
        if (locationCount !== locationIds.length) throw new Error('One or more selected locations are unavailable.')
      }

      const user = await tx.user.create({
        data: { email, name, role, passwordHash, isActive: true },
        select: { id: true, email: true, name: true, role: true },
      })
      if (locationIds.length) {
        await tx.userLocationAccess.createMany({
          data: locationIds.map((locationId) => ({ userId: user.id, locationId, canManageWallet: role === 'seller' })),
        })
      }
      if (role === 'seller') {
        await tx.seller.create({ data: { name, location_id: locationIds[0], user_id: user.id } })
      }
      await writeActivityLog({
        action: 'create', entityType: 'settings', entityId: user.id, entityName: email,
        details: `Created ${role} account with ${locationIds.length} assigned location(s).`,
        user: admin, request, source: 'admin-users', client: tx,
      })
      return user
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create account.' }, { status: 400 })
  }
}
