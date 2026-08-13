import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireRole } from '@/lib/apiAuth'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { requireLocationAccess } from '@/lib/locationAccess'
import { prisma } from '@/lib/prisma'
import { writeActivityLog } from '@/lib/serverActivityLog'

type SaleCurrency = 'SRD' | 'USD'

interface SaleLineInput {
  itemId?: unknown
  quantity?: unknown
}

function parseCurrency(value: unknown): SaleCurrency {
  if (value === 'SRD' || value === 'USD') return value
  throw new Error('Currency must be SRD or USD.')
}

function parseQuantity(value: unknown) {
  const quantity = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('Each sale quantity must be a whole number greater than zero.')
  return quantity
}

export async function POST(request: NextRequest) {
  const user = await requireRole(request, ['admin', 'seller'])
  if (user instanceof NextResponse) return user

  try {
    const body = await request.json() as Record<string, unknown>
    const locationId = typeof body.locationId === 'string' ? body.locationId : ''
    const walletId = typeof body.walletId === 'string' ? body.walletId : ''
    const currency = parseCurrency(body.currency)
    const rawLines = Array.isArray(body.items) ? body.items as SaleLineInput[] : []
    if (!locationId || !walletId || rawLines.length === 0) {
      return NextResponse.json({ error: 'Location, wallet, and at least one product are required.' }, { status: 400 })
    }

    const lines = rawLines.map((line) => {
      if (typeof line.itemId !== 'string' || !line.itemId) throw new Error('Every sale line needs a product.')
      return { itemId: line.itemId, quantity: parseQuantity(line.quantity) }
    })
    if (new Set(lines.map((line) => line.itemId)).size !== lines.length) {
      return NextResponse.json({ error: 'Combine duplicate products into one sale line.' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      await markFinanceLedgerRecorded(tx)
      await requireLocationAccess(tx, user, locationId)
      const [location, wallet, exchangeRate, seller] = await Promise.all([
        tx.location.findUnique({ where: { id: locationId }, select: { id: true, companyId: true } }),
        tx.wallet.findFirst({
          where: { id: walletId, location_id: locationId, currency, purpose: 'operational' },
          select: { id: true, companyId: true, balance: true, currency: true, type: true, location_id: true },
        }),
        tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
        user.role === 'seller'
          ? tx.seller.findUnique({ where: { user_id: user.id }, select: { id: true } })
          : Promise.resolve(null),
      ])
      if (!location || !wallet) throw new Error('Select an operational wallet for the chosen location and currency.')
      if (wallet.companyId !== location.companyId) throw new Error('The selected location and wallet belong to different companies.')

      const itemIds = lines.map((line) => line.itemId)
      const [items, stocks] = await Promise.all([
        tx.item.findMany({
          where: { id: { in: itemIds }, deletedAt: null, is_combo: false },
          select: { id: true, name: true, sellingPriceSrd: true, sellingPriceUsd: true },
        }),
        tx.stock.findMany({
          where: { locationId, itemId: { in: itemIds } },
          select: { id: true, itemId: true, quantity: true },
        }),
      ])

      const itemsById = new Map(items.map((item) => [item.id, item]))
      const stockByItemId = new Map(stocks.map((stock) => [stock.itemId, stock]))
      const resolvedLines = lines.map((line) => {
        const item = itemsById.get(line.itemId)
        const stock = stockByItemId.get(line.itemId)
        const unitPrice = item && currency === 'SRD' ? Number(item.sellingPriceSrd) : item ? Number(item.sellingPriceUsd) : 0
        if (!item || !stock) throw new Error('One or more selected products are unavailable at this location.')
        if (stock.quantity < line.quantity) throw new Error(`${item.name} does not have enough stock.`)
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error(`${item.name} has no valid ${currency} selling price.`)
        return { ...line, item, stock, unitPrice, subtotal: Math.round(unitPrice * line.quantity * 100) / 100 }
      })

      const totalAmount = Math.round(resolvedLines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100
      const sale = await tx.sale.create({
        data: {
          companyId: location.companyId,
          locationId,
          sellerId: seller?.id ?? null,
          currency,
          exchangeRate: currency === 'USD' ? exchangeRate?.usdToSrd ?? null : null,
          totalAmount,
          paymentMethod: wallet.type,
          wallet_id: wallet.id,
          saleItems: {
            create: resolvedLines.map((line) => ({
              companyId: location.companyId,
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
              is_custom_price: false,
            })),
          },
        },
        select: { id: true, createdAt: true },
      })

      await Promise.all(resolvedLines.map((line) => (
        tx.stock.update({ where: { id: line.stock.id }, data: { quantity: { decrement: line.quantity } } })
      )))

      const balanceBefore = Number(wallet.balance)
      const balanceAfter = Math.round((balanceBefore + totalAmount) * 100) / 100
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } })
      const walletTransaction = await tx.wallet_transactions.create({
        data: {
          companyId: location.companyId,
          wallet_id: wallet.id,
          sale_id: sale.id,
          type: 'credit',
          amount: totalAmount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `Seller sale ${sale.id}`,
          reference_type: 'sale',
          reference_id: sale.id,
          currency,
        },
      })
      await recordFinanceLedgerEntry(tx, {
        companyId: location.companyId,
        walletTransactionId: walletTransaction.id,
        walletId: wallet.id,
        locationId,
        sellerId: seller?.id ?? null,
        actorUserId: user.id,
        eventType: 'sale',
        direction: 'in',
        amount: totalAmount,
        currency,
        sourceType: 'sale',
        sourceId: sale.id,
        description: `Seller sale (${resolvedLines.length} product${resolvedLines.length === 1 ? '' : 's'})`,
        occurredAt: sale.createdAt,
        metadata: { paymentMethod: wallet.type, itemCount: resolvedLines.length },
      })

      await writeActivityLog({
        action: 'create', entityType: 'sale', entityId: sale.id,
        entityName: `Seller sale ${sale.id}`,
        details: `Recorded ${totalAmount.toFixed(2)} ${currency} to wallet ${wallet.id}.`,
        user, request, source: 'seller-portal', client: tx,
      })

      return { saleId: sale.id, totalAmount, currency, balanceAfter }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to record sale.' }, { status: 400 })
  }
}
