import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/apiAuth'
import { prisma } from '@/lib/prisma'

/** Read-only options for the server-only supplier-bill approval form. */
export async function GET(request: NextRequest) {
  const user = await requireAdmin(request)
  if (user instanceof NextResponse) return user
  const company = await prisma.company.findFirst({ where: { isActive: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'No active company is configured.' }, { status: 404 })
  const [wallets, locations, categories, purchaseOrders] = await Promise.all([
    prisma.wallet.findMany({ where: { companyId: company.id }, select: { id: true, personName: true, type: true, currency: true, location_id: true }, orderBy: [{ currency: 'asc' }, { personName: 'asc' }] }),
    prisma.location.findMany({ where: { companyId: company.id, is_active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.expenseCategory.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { not: 'cancelled' } },
      select: { id: true, currency: true, totalAmount: true, clients: { select: { name: true } }, location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const commitments = await prisma.financeObligation.findMany({
    where: { companyId: company.id, type: 'payable', sourceType: 'purchase_order', sourceId: { in: purchaseOrders.map((order) => order.id) }, status: { in: ['open', 'partial'] } },
    select: { sourceId: true, originalAmount: true, paidAmount: true },
  })
  const commitmentByOrderId = new Map(commitments.filter((commitment) => commitment.sourceId).map((commitment) => [commitment.sourceId!, commitment]))
  const linkedPurchaseOrders = purchaseOrders.flatMap((order) => {
    const commitment = commitmentByOrderId.get(order.id)
    if (!commitment) return []
    const outstandingAmount = Math.max(0, Number(commitment.originalAmount) - Number(commitment.paidAmount))
    if (outstandingAmount <= 0) return []
    return [{
      id: order.id,
      supplier: order.clients?.name ?? 'Supplier to confirm',
      locationId: order.location.id,
      location: order.location.name,
      currency: order.currency === 'USD' ? 'USD' : 'SRD',
      outstandingAmount,
    }]
  })
  return NextResponse.json({ data: { wallets: wallets.map((wallet) => ({ ...wallet, label: `${wallet.personName} · ${wallet.type} (${wallet.currency})` })), locations, categories, purchaseOrders: linkedPurchaseOrders } }, { headers: { 'Cache-Control': 'no-store' } })
}
