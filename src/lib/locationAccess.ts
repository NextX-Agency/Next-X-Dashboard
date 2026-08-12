import type { Prisma } from '@prisma/client'
import type { AuthUser } from '@/lib/apiAuth'

type AccessClient = Prisma.TransactionClient

export async function getAccessibleLocationIds(client: AccessClient, user: AuthUser): Promise<string[] | null> {
  if (user.role === 'admin') return null

  const accessRows = await client.userLocationAccess.findMany({
    where: { userId: user.id },
    select: { locationId: true },
  })
  return accessRows.map((access) => access.locationId)
}

export async function canAccessLocation(
  client: AccessClient,
  user: AuthUser,
  locationId: string,
  options?: { wallet?: boolean },
) {
  if (user.role === 'admin') return true

  const access = await client.userLocationAccess.findUnique({
    where: { userId_locationId: { userId: user.id, locationId } },
    select: { canManageWallet: true },
  })

  return Boolean(access && (!options?.wallet || access.canManageWallet))
}

export async function requireLocationAccess(
  client: AccessClient,
  user: AuthUser,
  locationId: string,
  options?: { wallet?: boolean },
) {
  if (await canAccessLocation(client, user, locationId, options)) return
  throw new Error('You do not have access to this location.')
}
