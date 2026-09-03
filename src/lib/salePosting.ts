import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import type { Prisma } from '@prisma/client'
import { markFinanceLedgerRecorded, recordFinanceLedgerEntry } from '@/lib/financeLedger'
import { roundCurrencyAmount } from '@/lib/pricing'
import { writeActivityLog } from '@/lib/serverActivityLog'
import {
  buildCommissions,
  resolveExchangeRate,
  resolveSaleLines,
  allocateInvoiceNumber,
  SaleValidationError,
  type SaleComboInput,
  type SaleCurrency,
  type SaleLineInput,
} from '@/lib/saleCreation'

/**
 * The one place a sale is written.
 *
 * This is the transaction body that used to live inline in the sales route. It
 * was lifted out unchanged so the order desk can convert a customer order into
 * a sale through exactly the same path, rather than growing a second money
 * path that drifts from the first. Header, line items, stock, commissions, the
 * wallet credit, the wallet transaction, the immutable ledger entry and the
 * activity log are all legs of one Serializable transaction (F-02, F-03, R7).
 *
 * The caller supplies the transaction, so a conversion can close its order in
 * the same atomic unit as the sale it produces.
 */

export interface PostSaleInput {
  locationId: string
  currency: SaleCurrency
  paymentMethod: string
  sellerId?: string | null
  items: SaleLineInput[]
  combos: SaleComboInput[]
  /** The customer, when one is known. Webshop orders always carry theirs. */
  clientId?: string | null
  notes?: string | null
}

export interface PostSaleActor {
  id: string
  email: string
  name: string | null
  role: string
}

export async function postSale(
  tx: Prisma.TransactionClient,
  input: PostSaleInput,
  actor: PostSaleActor,
  request: NextRequest,
  source = 'sales-api',
) {
  const { locationId, currency, paymentMethod, items, combos } = input
  const requestedSellerId = input.sellerId ?? null

  // Claim the ledger write before anything touches wallet_transactions, so
  // the capture trigger defers to the richer entry written below.
  await markFinanceLedgerRecorded(tx)

  const [location, activeRate] = await Promise.all([
    tx.location.findFirst({
      where: { id: locationId, is_active: true },
      select: { id: true, name: true, companyId: true, commission_rate: true },
    }),
    tx.exchangeRate.findFirst({ where: { isActive: true }, orderBy: { setAt: 'desc' }, select: { usdToSrd: true } }),
  ])
  if (!location) throw new SaleValidationError('That location is not available for sales.')

  const exchangeRate = resolveExchangeRate(activeRate?.usdToSrd)

  const wallet = await tx.wallet.findFirst({
    where: { location_id: locationId, currency, type: paymentMethod, purpose: 'operational' },
    select: { id: true, companyId: true, personName: true, currency: true, type: true },
  })
  if (!wallet) {
    throw new SaleValidationError(
      `No operational ${currency} ${paymentMethod} wallet exists for ${location.name}. Create one before selling.`,
    )
  }
  if (wallet.companyId !== location.companyId) {
    throw new SaleValidationError('The selected location and wallet belong to different companies.')
  }

  const { lines, stockByItemId } = await resolveSaleLines(
    tx,
    { locationId, currency, paymentMethod, items, combos },
    exchangeRate,
  )
  const totalAmount = roundCurrencyAmount(lines.reduce((sum, line) => sum + line.subtotal, 0))
  if (totalAmount <= 0) throw new SaleValidationError('A sale must come to more than zero.')

  // The seller must belong to this location — a commission cannot be
  // credited to someone who does not work there.
  const seller = requestedSellerId
    ? await tx.seller.findFirst({
        where: { id: requestedSellerId, location_id: locationId },
        select: { id: true, name: true, commissionRate: true },
      })
    : await tx.seller.findFirst({
        where: { location_id: locationId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, commissionRate: true },
      })
  if (requestedSellerId && !seller) {
    throw new SaleValidationError('That seller does not belong to the selected location.')
  }

  // One id ties the sale to its ledger entries, so a later void can post
  // its contra entries under the same correlation (T-13).
  const correlationId = randomUUID()
  // Allocated inside the transaction, so a failed sale releases the number
  // instead of burning it (T-16).
  const invoiceNumber = await allocateInvoiceNumber(tx)

  const sale = await tx.sale.create({
    data: {
      companyId: location.companyId,
      locationId,
      correlationId,
      invoiceNumber,
      invoiceIsReconstructed: false,
      sellerId: seller?.id ?? null,
      currency,
      exchangeRate: currency === 'USD' ? exchangeRate : null,
      totalAmount,
      paymentMethod,
      wallet_id: wallet.id,
      saleItems: {
        create: lines.map((line) => ({
          companyId: location.companyId,
          itemId: line.itemId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          is_custom_price: line.isCustomPrice,
          original_price: line.originalPrice,
          discount_reason: line.discountReason,
          // Freeze the cost and the rate onto the line as it is now (T-12).
          // These are recorded facts, not the backfill's inference, so they
          // are NOT flagged estimated.
          unitCostUsd: line.unitCostUsd,
          fxRateAtSale: exchangeRate,
          costIsEstimated: false,
        })),
      },
    },
    select: { id: true, createdAt: true, invoiceNumber: true },
  })

  // Atomic decrements. The old client read a quantity and wrote back
  // `quantity - n`, which loses a concurrent sale's decrement (R6).
  const demandByItemId = new Map<string, number>()
  for (const line of lines) {
    demandByItemId.set(line.itemId, (demandByItemId.get(line.itemId) ?? 0) + line.quantity)
  }
  for (const [itemId, demand] of demandByItemId) {
    const stock = stockByItemId.get(itemId)!
    await tx.stock.update({ where: { id: stock.id }, data: { quantity: { decrement: demand } } })
  }

  let commissionTotal = 0
  if (seller) {
    const categoryRateRows = await tx.seller_category_rates.findMany({
      where: { seller_id: seller.id },
      select: { category_id: true, commission_rate: true },
    })
    const categoryRates = new Map(categoryRateRows.map((row) => [row.category_id, Number(row.commission_rate)]))
    const drafts = buildCommissions(
      lines,
      categoryRates,
      Number(seller.commissionRate ?? 0),
      Number(location.commission_rate ?? 0),
    )

    for (const draft of drafts) {
      await tx.commission.create({
        data: {
          companyId: location.companyId,
          sellerId: seller.id,
          saleId: sale.id,
          location_id: locationId,
          category_id: draft.categoryId,
          commissionAmount: draft.amount,
          // The client never populated this, leaving every historical
          // commission unable to explain its own arithmetic.
          commission_rate: draft.rate,
          paid: false,
        },
      })
      commissionTotal = roundCurrencyAmount(commissionTotal + draft.amount)
    }
  }

  // Atomic increment, then read the committed balance back so the wallet
  // transaction records what actually happened rather than what the browser
  // believed the balance was at page load (F-03, R5, R6).
  const creditedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: totalAmount } },
    select: { balance: true },
  })
  const balanceAfter = roundCurrencyAmount(Number(creditedWallet.balance))
  const balanceBefore = roundCurrencyAmount(balanceAfter - totalAmount)

  const walletTransaction = await tx.wallet_transactions.create({
    data: {
      companyId: location.companyId,
      wallet_id: wallet.id,
      sale_id: sale.id,
      type: 'credit',
      amount: totalAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      currency,
      description: `Sale ${sale.id}`,
      reference_type: 'sale',
      reference_id: sale.id,
    },
  })

  await recordFinanceLedgerEntry(tx, {
    companyId: location.companyId,
    walletTransactionId: walletTransaction.id,
    walletId: wallet.id,
    locationId,
    sellerId: seller?.id ?? null,
    actorUserId: actor.id,
    eventType: 'sale',
    direction: 'in',
    amount: totalAmount,
    currency,
    sourceType: 'sale',
    sourceId: sale.id,
    correlationId,
    description: `Sale of ${lines.length} line${lines.length === 1 ? '' : 's'} at ${location.name}`,
    occurredAt: sale.createdAt,
    metadata: {
      paymentMethod,
      lineCount: lines.length,
      comboCount: combos.length,
      commissionTotal,
      exchangeRate: currency === 'USD' ? exchangeRate : null,
    },
  })

  await writeActivityLog({
    action: 'create',
    entityType: 'sale',
    entityId: sale.id,
    entityName: `Sale ${sale.id.slice(0, 8)}`,
    details: `Recorded ${totalAmount.toFixed(2)} ${currency} at ${location.name} into ${wallet.personName}`
      + `${seller ? ` · seller ${seller.name}` : ''}`
      + `${commissionTotal > 0 ? ` · commission ${commissionTotal.toFixed(2)}` : ''}`,
    user: actor,
    request,
    source,
    client: tx,
  })

  return {
    saleId: sale.id,
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt.toISOString(),
    locationName: location.name,
    currency,
    paymentMethod,
    totalAmount,
    commissionTotal,
    walletName: wallet.personName,
    balanceAfter,
    sellerName: seller?.name ?? null,
    items: lines.map((line) => ({
      name: line.itemName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      originalPrice: line.originalPrice,
      discountReason: line.discountReason,
      comboKey: line.comboKey,
    })),
  }
}
