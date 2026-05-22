import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'
import { getWalletPurposeMap, setWalletPurpose } from '@/lib/walletPurpose'
import { isWalletPurpose } from '@/types/walletPurpose'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const data = await getWalletPurposeMap()
    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('Wallet purpose map error:', error)
    return NextResponse.json({ error: 'Failed to load wallet purposes.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json() as { walletId?: string; purpose?: unknown }
    const walletId = typeof body.walletId === 'string' ? body.walletId.trim() : ''

    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required.' }, { status: 400 })
    }

    if (!isWalletPurpose(body.purpose)) {
      return NextResponse.json({ error: 'purpose must be operational, savings, or reserve.' }, { status: 400 })
    }

    const wallet = await prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found.' }, { status: 404 })
    }

    const data = await setWalletPurpose(walletId, body.purpose)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Wallet purpose update error:', error)
    return NextResponse.json({ error: 'Failed to save wallet purpose.' }, { status: 500 })
  }
}