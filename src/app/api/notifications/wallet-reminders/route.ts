import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function reminderDays() {
  const rawValue = Number.parseInt(process.env.WALLET_RECONCILIATION_REMINDER_DAYS ?? '7', 10)
  return Number.isFinite(rawValue) ? Math.min(Math.max(rawValue, 1), 31) : 7
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET must be configured before reminder scheduling is enabled.' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const cutoff = new Date(Date.now() - reminderDays() * 24 * 60 * 60 * 1000)
    const accessRows = await prisma.userLocationAccess.findMany({
      where: { user: { role: 'seller', isActive: true }, canManageWallet: true },
      select: {
        userId: true,
        locationId: true,
        location: {
          select: {
            id: true,
            name: true,
            wallets: {
              select: { id: true, updatedAt: true, type: true, currency: true },
            },
          },
        },
      },
    })

    let created = 0
    for (const access of accessRows) {
      for (const wallet of access.location.wallets) {
        const latestReconciliation = await prisma.walletReconciliation.findFirst({
          where: { walletId: wallet.id },
          select: { reconciledAt: true },
          orderBy: { reconciledAt: 'desc' },
        })
        const lastCheck = latestReconciliation?.reconciledAt ?? wallet.updatedAt
        if (lastCheck > cutoff) continue

        const existing = await prisma.userNotification.findFirst({
          where: {
            userId: access.userId,
            walletId: wallet.id,
            notificationType: 'wallet_reconciliation_due',
            resolvedAt: null,
          },
          select: { id: true },
        })
        if (existing) continue

        await prisma.userNotification.create({
          data: {
            userId: access.userId,
            walletId: wallet.id,
            locationId: access.locationId,
            notificationType: 'wallet_reconciliation_due',
            title: 'Wallet check is due',
            body: `${access.location.name}: confirm the ${wallet.type} ${wallet.currency} wallet balance.`,
            metadata: { lastCheckedAt: lastCheck.toISOString(), reminderDays: reminderDays() },
          },
        })
        created += 1
      }
    }

    return NextResponse.json({ success: true, created, cutoff: cutoff.toISOString() })
  } catch (error) {
    console.error('Wallet reminder job error:', error)
    return NextResponse.json({ error: 'Failed to create wallet reminders.' }, { status: 500 })
  }
}
